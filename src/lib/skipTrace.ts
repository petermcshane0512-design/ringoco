/**
 * BatchData skip-trace integration.
 *
 * BatchData (batchdata.com) — primary US homeowner skip-trace provider used
 * by ~70% of real-estate wholesalers + service-business lead programs.
 * Single-record lookup endpoint, $0.10/attempt, returns:
 *   - owner_name (current titleholder, public record)
 *   - owner_phone[] (carrier + line type tagged)
 *   - owner_email[]
 *   - mailing_address (if different from property)
 *
 * Hit rate at default settings runs 55-70% on residential US addresses —
 * higher in newer ZIPs, lower in HOA-owned & manufactured-home tracts.
 *
 * Endpoint:        POST https://api.batchdata.com/api/v1/property/skip-trace
 * Auth:            Bearer ${BATCHDATA_API_KEY}
 * Rate limit:      300 req/min default, 1500 req/min after KYC
 * Billing:         per-request, deducted from prepaid balance
 *
 * Failure modes:
 *   - 402 insufficient balance → log + return no-phone result, don't block
 *   - 5xx                      → log + return no-phone result (transient)
 *   - timeout (>10s)           → abort + return no-phone result
 *
 * No retries — we'll catch missed enrichments on the next nightly sweep.
 */

const BATCHDATA_API = 'https://api.batchdata.com/api/v1/property/skip-trace'
const REQUEST_TIMEOUT_MS = 10_000

export type SkipTraceInput = {
  street: string
  city?: string
  state?: string
  zip?: string
}

export type SkipTraceResult = {
  ok: boolean
  hit: boolean                 // did we get any owner contact info back?
  owner_name?: string | null
  owner_phones?: string[]      // E.164 if possible, raw if not
  owner_emails?: string[]
  raw_response?: unknown       // stored as jsonb for audit
  cost_cents: number           // we charged ~10c whether hit or not
  error?: string
}

type BatchDataResponse = {
  status?: { code: number; text?: string }
  results?: {
    persons?: Array<{
      name?: { full?: string; first?: string; last?: string }
      phoneNumbers?: Array<{ number?: string; type?: string; reachable?: boolean }>
      emails?: Array<{ email?: string }>
    }>
  }
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return raw
}

export async function skipTraceAddress(input: SkipTraceInput): Promise<SkipTraceResult> {
  const key = process.env.BATCHDATA_API_KEY
  if (!key) {
    return { ok: false, hit: false, cost_cents: 0, error: 'BATCHDATA_API_KEY not configured' }
  }

  const body = {
    requests: [{
      propertyAddress: {
        street: input.street,
        city: input.city,
        state: input.state,
        zip: input.zip,
      },
    }],
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(BATCHDATA_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (res.status === 402) {
      return { ok: false, hit: false, cost_cents: 0, error: 'batchdata insufficient balance — refill required' }
    }
    if (!res.ok) {
      return { ok: false, hit: false, cost_cents: 0, error: `batchdata HTTP ${res.status}` }
    }

    const json = await res.json() as BatchDataResponse
    const persons = json.results?.persons ?? []
    const phones = new Set<string>()
    const emails = new Set<string>()
    let firstName: string | null = null

    for (const p of persons) {
      if (!firstName && p.name?.full) firstName = p.name.full
      for (const ph of p.phoneNumbers ?? []) {
        if (ph.number) phones.add(normalizePhone(ph.number))
      }
      for (const em of p.emails ?? []) {
        if (em.email) emails.add(em.email.toLowerCase())
      }
    }

    const hit = phones.size > 0 || emails.size > 0
    return {
      ok: true,
      hit,
      owner_name: firstName,
      owner_phones: [...phones],
      owner_emails: [...emails],
      raw_response: json,
      cost_cents: 10,
    }
  } catch (e) {
    clearTimeout(timer)
    const err = e as { name?: string; message?: string }
    if (err.name === 'AbortError') {
      return { ok: false, hit: false, cost_cents: 0, error: 'batchdata timeout (10s)' }
    }
    return { ok: false, hit: false, cost_cents: 0, error: err.message || String(e) }
  }
}

/**
 * Enrich every still-un-traced lead in a batch. Stops when budget exhausted
 * or all leads attempted. Returns per-lead outcome for logging.
 */
export type LeadShape = {
  id: string
  street_address: string | null
  city?: string | null
  state?: string | null
  zip: string | null
}

export type BatchEnrichResult = {
  attempted: number
  hits: number
  cost_cents: number
  per_lead: Array<{ lead_id: string; hit: boolean; phones: number; error?: string }>
}

export async function enrichLeadsWithSkipTrace(
  leads: LeadShape[],
  options: { maxBudgetCents?: number } = {},
): Promise<BatchEnrichResult> {
  const max = options.maxBudgetCents ?? 1000   // $10 per call by default
  const out: BatchEnrichResult = { attempted: 0, hits: 0, cost_cents: 0, per_lead: [] }
  for (const l of leads) {
    if (out.cost_cents + 10 > max) break
    if (!l.street_address) continue
    const r = await skipTraceAddress({
      street: l.street_address,
      city: l.city ?? undefined,
      state: l.state ?? undefined,
      zip: l.zip ?? undefined,
    })
    out.attempted++
    out.cost_cents += r.cost_cents
    if (r.hit) out.hits++
    out.per_lead.push({
      lead_id: l.id,
      hit: r.hit,
      phones: r.owner_phones?.length ?? 0,
      error: r.error,
    })
  }
  return out
}
