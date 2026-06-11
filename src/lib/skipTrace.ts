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

import { canSpendBatchData, logBatchDataSpend } from '@/lib/batchdataSpend'

const BATCHDATA_API = 'https://api.batchdata.com/api/v1/property/skip-trace'
const BATCHDATA_SEARCH_API = 'https://api.batchdata.com/api/v1/property/search'
const REQUEST_TIMEOUT_MS = 10_000

/**
 * 2026-06-11 — env keys can arrive with an invisible BOM (U+FEFF) when set
 * via a PowerShell pipe (`"key" | vercel env add` writes one). fetch()
 * throws "Cannot convert argument to a ByteString... 65279" on the header
 * and EVERY BatchData call dies. Strip BOM + zero-width junk + whitespace
 * at the single point of read so no env-entry mistake can break prod again.
 */
export function batchdataKey(): string | undefined {
  const raw = process.env.BATCHDATA_API_KEY
  if (!raw) return undefined
  const cleaned = raw.replace(/[﻿​‌‍]/g, '').trim()
  return cleaned || undefined
}

/**
 * BatchData Property Search — finds REAL homeowners at REAL addresses in
 * a given ZIP, filtered by trade-relevant criteria. Returns owner name +
 * full address + year built + last sale date. NO phone — that requires a
 * follow-up skip-trace call ($0.10 each).
 *
 * Cost: ~$0.05 per property returned.
 *
 * Used by /api/agents/find-real-leads to populate address-level leads
 * for any US ZIP — replacing the useless census-aging "ZIP only"
 * inferences that have no phone, no name, no actual house.
 */

export type PropertySearchInput = {
  zip: string
  yearBuiltMin?: number
  yearBuiltMax?: number
  recentSaleWithinDays?: number      // owner bought in last N days
  ownerOccupiedOnly?: boolean
  resultsLimit?: number              // default 25
}

export type PropertyResult = {
  street_address: string | null
  city: string | null
  state: string | null
  zip: string | null
  owner_name: string | null
  year_built: number | null
  last_sale_date: string | null
  last_sale_price: number | null
  home_value_est: number | null
  sqft: number | null
}

export type PropertySearchResult = {
  ok: boolean
  cost_cents: number
  properties: PropertyResult[]
  error?: string
}

type BatchDataPropertyAddress = {
  street?: string; city?: string; state?: string; zip?: string
}
type BatchDataPropertyOwner = {
  name?: { full?: string }
  fullName?: string
}
type BatchDataPropertyRow = {
  address?: BatchDataPropertyAddress
  owner?: BatchDataPropertyOwner
  building?: { yearBuilt?: number; totalBuildingAreaSquareFeet?: number }
  sale?: { lastSale?: { saleDate?: string; saleAmount?: number } }
  valuation?: { estimatedValue?: number }
}
type BatchDataSearchResponse = {
  results?: { properties?: BatchDataPropertyRow[] }
  status?: { code?: number; text?: string }
}

export async function batchdataPropertySearch(input: PropertySearchInput): Promise<PropertySearchResult> {
  const key = batchdataKey()
  if (!key) {
    return { ok: false, cost_cents: 0, properties: [], error: 'BATCHDATA_API_KEY not configured' }
  }

  // 2026-06-11 — spend cap armed AT THE SPEND POINT. Every caller of this
  // function (find-real-leads, crons, admin tools, future code) is gated +
  // logged without remembering to wire it themselves. Do NOT add a second
  // logBatchDataSpend in callers — that double-counts and halves the cap.
  const estCents = Math.min(50, input.resultsLimit ?? 25) * 5
  const gate = await canSpendBatchData(estCents)
  if (!gate.ok) {
    return { ok: false, cost_cents: 0, properties: [], error: `daily spend cap hit (${gate.spentTodayCents}/${gate.capCents}c)` }
  }

  const requestPayload: Record<string, unknown> = {
    searchCriteria: {
      query: input.zip,                          // BatchData accepts ZIP as primary query
      ...(input.yearBuiltMin || input.yearBuiltMax ? {
        building: {
          yearBuilt: {
            min: input.yearBuiltMin,
            max: input.yearBuiltMax,
          },
        },
      } : {}),
      ...(input.recentSaleWithinDays ? {
        sale: {
          lastSale: {
            saleDate: {
              min: new Date(Date.now() - input.recentSaleWithinDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            },
          },
        },
      } : {}),
      ...(input.ownerOccupiedOnly ? {
        owner: { occupied: true },
      } : {}),
    },
    options: {
      take: Math.min(50, input.resultsLimit ?? 25),
    },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(BATCHDATA_SEARCH_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { ok: false, cost_cents: 0, properties: [], error: `batchdata search HTTP ${res.status}: ${txt.slice(0, 200)}` }
    }

    const json = await res.json() as BatchDataSearchResponse
    const rows = json.results?.properties ?? []
    const props: PropertyResult[] = rows.map((r) => ({
      street_address: r.address?.street ?? null,
      city: r.address?.city ?? null,
      state: r.address?.state ?? null,
      zip: r.address?.zip ?? null,
      owner_name: r.owner?.name?.full ?? r.owner?.fullName ?? null,
      year_built: r.building?.yearBuilt ?? null,
      last_sale_date: r.sale?.lastSale?.saleDate ?? null,
      last_sale_price: r.sale?.lastSale?.saleAmount ?? null,
      home_value_est: r.valuation?.estimatedValue ?? null,
      sqft: r.building?.totalBuildingAreaSquareFeet ?? null,
    })).filter((p) => p.street_address)  // drop rows with no address

    const costCents = props.length * 5  // $0.05 per returned property
    await logBatchDataSpend({
      costCents,
      caller: 'batchdataPropertySearch',
      context: { zip: input.zip, returned: props.length },
      resultOk: true,
    })
    return {
      ok: true,
      cost_cents: costCents,
      properties: props,
    }
  } catch (e) {
    clearTimeout(timer)
    const err = e as { name?: string; message?: string }
    if (err.name === 'AbortError') {
      return { ok: false, cost_cents: 0, properties: [], error: 'batchdata search timeout (10s)' }
    }
    return { ok: false, cost_cents: 0, properties: [], error: err.message || String(e) }
  }
}

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
  const key = batchdataKey()
  if (!key) {
    return { ok: false, hit: false, cost_cents: 0, error: 'BATCHDATA_API_KEY not configured' }
  }

  // 2026-06-11 — spend cap armed at the spend point (see batchdataPropertySearch).
  const gate = await canSpendBatchData(10)
  if (!gate.ok) {
    return { ok: false, hit: false, cost_cents: 0, error: `daily spend cap hit (${gate.spentTodayCents}/${gate.capCents}c)` }
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
    await logBatchDataSpend({
      costCents: 10,
      caller: 'skipTraceAddress',
      context: { street: input.street, zip: input.zip ?? null, hit },
      resultOk: true,
    })
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
