import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { canSpendBatchData, logBatchDataSpend } from '@/lib/batchdataSpend'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/free-lead/generate
 *
 * Per Fable 5 review — never fire paid BatchData on raw email click.
 *
 * Hardening (in order):
 *   1. Method gate — POST ONLY. GET shows the page; only an explicit
 *      human button-press POSTs here. Bypasses Outlook SafeLinks /
 *      Barracuda / Mimecast crawlers that auto-GET every URL in inbound mail.
 *   2. Bot UA filter — basic deny-list. Not bulletproof but free.
 *   3. Per-biz_id dedup — one generation per prospect. Repeat hits
 *      return the cached lead.
 *   4. Daily $10 BatchData spend cap — kill switch protects balance
 *      from scanner floods that slip past 1+2.
 *   5. NO skip-trace at generate. Returns redacted phone. Full unlock
 *      at /api/stripe/webhook on payment_succeeded.
 *
 * Returns the same shape as /api/free-lead/claim — caller renders both
 * with the same UI.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const PROPERTY_SEARCH_COST_CENTS = 5  // $0.05

// 2026-06-10 — hot-lead-call pivot. Number of distinct human-button-press
// visits to the personalized landing that qualifies as "hot." Peter's
// cell gets an SMS at this threshold so he can call within minutes.
// Source of truth lives here, not in the SQL CHECK constraint, because
// we may want to A/B-test 2 vs 3 without a migration.
const HOT_VISIT_THRESHOLD = 2

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://www.bellavego.com'
const BAD_UA_PATTERNS = [
  /bot/i,
  /crawl/i,
  /spider/i,
  /scanner/i,
  /barracuda/i,
  /mimecast/i,
  /proofpoint/i,
  /safelinks/i,
  /microsoft.*defender/i,
  /preview/i,
]

function isBot(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') || ''
  if (!ua) return true
  return BAD_UA_PATTERNS.some((p) => p.test(ua))
}

function redactPhone(full: string | null): string | null {
  if (!full) return null
  const digits = full.replace(/\D/g, '')
  if (digits.length < 10) return null
  const area = digits.slice(0, 3)
  const last2 = digits.slice(-2)
  return `(${area}) •••-••${last2}`
}

type BatchDataProperty = {
  address?: { street?: string; city?: string; state?: string; zip?: string; latitude?: number; longitude?: number }
  building?: { yearBuilt?: number }
  owner?: { name?: { full?: string }; fullName?: string }
  deedHistory?: { recordingDate?: string }[]
  valuation?: { estimatedValue?: number }
  phoneNumbers?: { number?: string; type?: string }[]
}

// US state name → 2-letter postal code map (covers all 50 + DC + PR).
// Outreach CSVs often carry full names ('Florida') rather than codes.
const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC', 'puerto rico': 'PR',
}

function normalizeState(raw: string): string {
  const s = (raw || '').trim()
  if (!s) return ''
  if (s.length === 2) return s.toUpperCase()
  const code = STATE_NAME_TO_CODE[s.toLowerCase()]
  return code || s.slice(0, 2).toUpperCase()
}

async function batchDataSearch(loc: { zip?: string; city?: string; state?: string }, trade: string): Promise<{ properties: BatchDataProperty[]; ok: boolean }> {
  // Trade-specific filter logic mirrors src/app/api/agents/find-real-leads.
  // 2026-06-10 — accept zip OR city+state. Outreach_leads CSV often has
  // city/state but no zip; BatchData supports both query shapes.
  const t = (trade || '').toLowerCase()
  const criteria: Record<string, unknown> = {
    ownerOccupiedOnly: true,
    quickList: 'recently-sold',
  }
  if (loc.zip) {
    criteria.zip = loc.zip
  } else if (loc.city && loc.state) {
    criteria.city = loc.city
    criteria.state = normalizeState(loc.state)
  } else {
    return { properties: [], ok: false }
  }
  if (t.includes('elect')) {
    criteria.yearBuiltMax = 1990
  } else if (t.includes('roof')) {
    criteria.yearBuiltMax = 2005
  } else if (t.includes('handy')) {
    criteria.recentSaleWithinDays = 120
  } else {
    // HVAC / plumbing default — system-age window
    criteria.yearBuiltMin = 1985
    criteria.yearBuiltMax = 2005
  }

  const res = await fetch('https://api.batchdata.com/api/v1/property/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.BATCHDATA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ searchCriteria: criteria, options: { take: 10 } }),
  })
  if (!res.ok) {
    console.warn(`[free-lead/generate] BatchData ${res.status} for loc=${JSON.stringify(loc)} trade=${trade}`)
    return { properties: [], ok: false }
  }
  const data = await res.json() as { results?: { properties?: BatchDataProperty[] } }
  return { properties: data.results?.properties || [], ok: true }
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const bizId = (url.searchParams.get('b') || '').slice(0, 64)
  if (!bizId) return NextResponse.json({ ok: false, error: 'b required' }, { status: 400 })

  // Hardening #2 — UA bot filter (before any DB / API hit)
  if (isBot(req)) {
    await supabase
      .from('prospect_free_leads')
      .update({ bot_clicks_blocked: 1 })  // increment via raw SQL would be nicer; this overwrites for safety
      .eq('biz_id', bizId)
    return NextResponse.json({ ok: false, error: 'bot_blocked' }, { status: 403 })
  }

  // Hardening #3 — per-biz_id dedup
  const existing = await supabase
    .from('prospect_free_leads')
    .select('*')
    .eq('biz_id', bizId)
    .maybeSingle()
  if (existing.error) {
    return NextResponse.json({ ok: false, error: 'lookup failed' }, { status: 500 })
  }
  const row = existing.data as Record<string, unknown> | null
  if (!row) {
    return NextResponse.json({ ok: false, error: 'prospect not found' }, { status: 404 })
  }

  // 2026-06-10 — hot-lead-call pivot. Every legitimate human POST (i.e.
  // past isBot + row-exists gates) is a "visit." Bump the count + alert
  // Peter if the threshold is hit.
  await bumpVisitAndMaybeAlertHot(bizId, row)

  if (row.generation_completed_at && row.lead_owner_name) {
    // Cached hit — return existing
    return NextResponse.json({ ok: true, cached: true, lead: pluckLead(row) })
  }

  // Hardening #4 — daily spend cap
  const gate = await canSpendBatchData(PROPERTY_SEARCH_COST_CENTS)
  if (!gate.ok) {
    await supabase
      .from('prospect_free_leads')
      .update({
        generation_requested_at: new Date().toISOString(),
        generation_failed_reason: `spend_cap:${gate.reason}`,
      })
      .eq('biz_id', bizId)
    return NextResponse.json({
      ok: false,
      error: 'capacity reached — try later',
      reason: gate.reason,
      spent_today_cents: gate.spentTodayCents,
      cap_cents: gate.capCents,
    }, { status: 429 })
  }

  // Stamp request start
  await supabase
    .from('prospect_free_leads')
    .update({ generation_requested_at: new Date().toISOString() })
    .eq('biz_id', bizId)

  const zip = (row.zip as string) || ''
  const city = (row.city as string) || ''
  const state = (row.state as string) || ''
  const trade = (row.trade as string) || 'hvac'

  // 2026-06-10 — accept zip OR city+state. Only refuse spend if BOTH paths
  // are unavailable (no zip AND no city+state pair).
  if (!zip && (!city || !state)) {
    await supabase
      .from('prospect_free_leads')
      .update({ generation_failed_reason: 'no_location_data' })
      .eq('biz_id', bizId)
    return NextResponse.json({ ok: false, error: 'area_not_open', message: "We're opening your area now — be the first when we do." }, { status: 200 })
  }

  const { properties, ok } = await batchDataSearch({ zip, city, state }, trade)
  await logBatchDataSpend({
    costCents: PROPERTY_SEARCH_COST_CENTS,
    caller: 'free-lead-generate',
    context: { biz_id: bizId, zip, city, state, trade, result_count: properties.length },
    resultOk: ok,
  })

  if (!ok || properties.length === 0) {
    await supabase
      .from('prospect_free_leads')
      .update({ generation_failed_reason: ok ? 'no_results' : 'batchdata_error' })
      .eq('biz_id', bizId)
    return NextResponse.json({
      ok: false,
      error: 'area_not_open',
      message: "We're opening your area now — be the first when we do.",
    }, { status: 200 })
  }

  // Pick the freshest / highest-value property as the bait lead.
  // Sort: recent sale first, then highest valuation, then year_built descending.
  properties.sort((a, b) => {
    const aSale = a.deedHistory?.[0]?.recordingDate || ''
    const bSale = b.deedHistory?.[0]?.recordingDate || ''
    if (aSale !== bSale) return aSale > bSale ? -1 : 1
    return (b.valuation?.estimatedValue || 0) - (a.valuation?.estimatedValue || 0)
  })
  const pick = properties[0]
  const owner = pick.owner?.name?.full || pick.owner?.fullName || 'Homeowner'
  const street = pick.address?.street || ''
  // Pick's address city/state are looked up but currently not written
  // back to prospect_free_leads — keep as void-marked locals so the
  // shadow w/ the outer prospect city/state doesn't trip the compiler.
  void (pick.address?.city || '')
  void (pick.address?.state || '')
  const yearBuilt = pick.building?.yearBuilt || null
  const value = pick.valuation?.estimatedValue || null
  const phoneFull = pick.phoneNumbers?.[0]?.number || null
  const phoneRedacted = redactPhone(phoneFull)

  // Trade-specific signal_detail
  const signal = trade.includes('elect') ? 'aged' : trade.includes('roof') ? 'aged' : trade.includes('handy') ? 'move_in' : 'aged'
  const signalDetail = signal === 'move_in'
    ? `New homeowner — recent move-in (${yearBuilt ? `built ${yearBuilt}` : 'aging-home profile'})`
    : `${yearBuilt ? `Built ${yearBuilt}` : 'Aging property'} — ${trade.includes('elect') ? 'pre-1990 panel risk window' : trade.includes('roof') ? 'asphalt past replacement window' : 'system age replacement window'}`

  // Trade-specific job-value estimate from home value (honest multiplier ranges)
  const valueMultiplier = trade.includes('roof') ? [0.020, 0.045] : trade.includes('hvac') ? [0.008, 0.018] : trade.includes('elect') ? [0.005, 0.015] : trade.includes('plumb') ? [0.004, 0.012] : [0.002, 0.008]
  const estJobMin = value ? Math.round((value * valueMultiplier[0]) / 100) * 100 : null
  const estJobMax = value ? Math.round((value * valueMultiplier[1]) / 100) * 100 : null

  await supabase
    .from('prospect_free_leads')
    .update({
      lead_owner_name: owner,
      lead_street: street,
      lead_year_built: yearBuilt,
      lead_value: value,
      lead_phone: phoneRedacted,  // REDACTED only — full unlocks at payment_succeeded
      lead_signal: signal,
      lead_signal_detail: signalDetail,
      lead_est_job_min: estJobMin,
      lead_est_job_max: estJobMax,
      generation_completed_at: new Date().toISOString(),
      generation_failed_reason: null,
    })
    .eq('biz_id', bizId)

  const updated = await supabase
    .from('prospect_free_leads')
    .select('*')
    .eq('biz_id', bizId)
    .maybeSingle()

  return NextResponse.json({ ok: true, cached: false, lead: pluckLead(updated.data as Record<string, unknown>) })
}

/**
 * Increment visit_count + last_visited_at on every legitimate human POST.
 * If the threshold is crossed and we haven't already SMS'd Peter, fire
 * an SMS to his cell with the prospect's business + city + trade + the
 * /free-lead URL so he can call them within minutes.
 *
 * Idempotent on the SMS: hot_call_sms_sent_at gates it so a contractor
 * who hits visit 3, 4, 5 doesn't blast Peter's phone.
 */
async function bumpVisitAndMaybeAlertHot(
  bizId: string,
  rowBefore: Record<string, unknown>,
): Promise<void> {
  const priorCount = Number(rowBefore.visit_count ?? 0)
  const nextCount = priorCount + 1
  await supabase
    .from('prospect_free_leads')
    .update({
      visit_count: nextCount,
      last_visited_at: new Date().toISOString(),
    })
    .eq('biz_id', bizId)

  if (nextCount < HOT_VISIT_THRESHOLD) return
  if (rowBefore.hot_call_sms_sent_at) return

  try {
    // Pull contractor context from the joined outreach_leads row.
    // prospect_free_leads.email is the contractor's email — the same key
    // outreach_leads uses. business_name + owner_first_name + city +
    // state + trade come from that join. No phone column on outreach_leads
    // yet — Peter looks the phone up in Instantly/Apollo via the email.
    const email = (rowBefore.email as string | null) || null
    let businessName: string | null = null
    let ownerFirstName: string | null = null
    if (email) {
      const ol = await supabase
        .from('outreach_leads')
        .select('business_name, owner_first_name')
        .eq('email', email)
        .maybeSingle()
      businessName = (ol.data as { business_name?: string } | null)?.business_name ?? null
      ownerFirstName = (ol.data as { owner_first_name?: string } | null)?.owner_first_name ?? null
    }
    const city = (rowBefore.city as string | null) || ''
    const state = (rowBefore.state as string | null) || ''
    const zip = (rowBefore.zip as string | null) || ''
    const trade = (rowBefore.trade as string | null) || ''
    const url = `${SITE_URL}/free-lead?b=${encodeURIComponent(bizId)}`

    const founderPhone = process.env.FOUNDER_ALERT_PHONE ?? '+17737109565'
    const sms =
      `🔥 HOT LEAD — ${nextCount}× visit on free-lead landing\n\n` +
      `${businessName || '(unknown shop)'}${ownerFirstName ? ` · ${ownerFirstName}` : ''}\n` +
      `${trade.toUpperCase()} · ${city}${state ? `, ${state}` : ''} ${zip}\n` +
      `Email: ${email || '—'}\n` +
      `Their landing: ${url}\n\n` +
      `Call them NOW. Speed-to-lead = close.`

    await twilioClient.messages.create({
      body: sms,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: founderPhone,
    })
    await supabase
      .from('prospect_free_leads')
      .update({ hot_call_sms_sent_at: new Date().toISOString() })
      .eq('biz_id', bizId)
    console.log(`[hot-lead] SMS sent to ${founderPhone} for biz=${bizId} visits=${nextCount}`)
  } catch (e) {
    console.error('[hot-lead] alert SMS failed (non-blocking):', (e as Error).message)
  }
}

function pluckLead(row: Record<string, unknown>) {
  return {
    owner: row.lead_owner_name,
    street: row.lead_street,
    city: row.city,
    state: row.state,
    zip: row.zip,
    phone: row.lead_phone,  // REDACTED — full at payment
    email: row.lead_email,
    year_built: row.lead_year_built,
    value: row.lead_value,
    signal: row.lead_signal,
    signal_detail: row.lead_signal_detail,
    est_job_min: row.lead_est_job_min,
    est_job_max: row.lead_est_job_max,
    trade: row.trade,
    phone_redacted: true,  // signals UI to render unlock-on-checkout state
  }
}
