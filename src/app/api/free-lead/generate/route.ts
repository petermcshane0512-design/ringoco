import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { canSpendBatchData, logBatchDataSpend } from '@/lib/batchdataSpend'
import { batchdataKey } from '@/lib/skipTrace'

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
  let digits = full.replace(/\D/g, '')
  // Drop the US country code so "+1 773…" redacts to (773), not (177).
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
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
      Authorization: `Bearer ${batchdataKey()}`,
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
  let row = existing.data as Record<string, unknown> | null
  if (!row) {
    // 2026-06-13 per Peter — a link must NEVER 404. If the biz_id has no
    // prospect_free_leads row (loaded by a path that didn't pre-create one,
    // or a stale link), create a minimal row ON THE FLY and proceed. The
    // pool query below widens to a real cited homeowner even without a
    // city/trade hint, so the click still reveals a real lead instead of a
    // dead "prospect not found." City-matched rows are pre-seeded elsewhere;
    // this is the safety net that kills the broken-link class of bug.
    const { data: created } = await supabase
      .from('prospect_free_leads')
      .upsert({ biz_id: bizId, trade: 'hvac', source_batch: 'autocreate_on_click' }, { onConflict: 'biz_id' })
      .select('*')
      .maybeSingle()
    row = (created as Record<string, unknown> | null) ?? { biz_id: bizId, trade: 'hvac' }
  }

  // 2026-06-10 — hot-lead-call pivot. Every legitimate human POST (i.e.
  // past isBot + row-exists gates) is a "visit." Bump the count + alert
  // Peter if the threshold is hit.
  // 2026-06-12 — SKIP the bump for admin/test traffic (any request carrying
  // x-admin-secret). A 50-row stress test inflated "site visits" to 52,
  // overstating real interest. Real contractors never send that header, so
  // gating on it keeps the metric meaning only genuine human clicks.
  const isAdminTraffic = req.headers.get('x-admin-secret') === process.env.ADMIN_API_SECRET && !!process.env.ADMIN_API_SECRET
  if (!isAdminTraffic) await bumpVisitAndMaybeAlertHot(bizId, row)

  if (row.generation_completed_at && row.lead_owner_name) {
    // Cached hit — return existing (+ geocoded pin for the demo map)
    const cachedLoc = await leadLatLngFromAddress(row)
    return NextResponse.json({ ok: true, cached: true, lead: { ...pluckLead(row), lat: cachedLoc?.lat ?? null, lng: cachedLoc?.lng ?? null } })
  }

  // 2026-06-12 — the BatchData daily-spend gate MOVED down to guard only the
  // BatchData fallback (below). It used to sit here and 429 the whole
  // endpoint when the cap was hit — blocking the FREE Supabase pool path
  // that needs no BatchData at all. The pool serves the lead for $0, so a
  // capped BatchData balance must never stop a click from getting a lead.

  // Stamp request start
  await supabase
    .from('prospect_free_leads')
    .update({ generation_requested_at: new Date().toISOString() })
    .eq('biz_id', bizId)

  const zip = (row.zip as string) || ''
  const city = (row.city as string) || ''
  const state = (row.state as string) || ''
  const trade = (row.trade as string) || 'hvac'

  // 2026-06-12 per Peter ("generate EVERY time"). The old code returned
  // "area opening soon" whenever location was incomplete (e.g. a contact
  // with a city but blank state). That killed legitimate clicks. We no
  // longer gate on location here — the pool query below widens all the way
  // to "any real cited homeowner," so even a location-less contact still
  // gets a real lead. Location only matters for the BatchData fallback,
  // which is now a near-dead last resort.

  // 2026-06-12 — POOL-FIRST per Peter (Elon step 2: delete the flaky call).
  // The BatchData city-only search returned WRONG-STATE properties for our
  // no-zip contacts (a Chicago contact got a Dallas address). We already
  // hold thousands of REAL, geocoded, in-city enforcement + permit leads —
  // serve one of those as the free bait instead. Better lead (the actual
  // cited-homeowner moat), guaranteed right city, $0, no wrong-city bug.
  // BatchData stays as the fallback only when the pool has nothing local.
  {
    const tradeMap: Record<string, string> = {
      masonry: 'handyman', painting: 'handyman', tuckpointing: 'handyman', carpentry: 'handyman', fence: 'handyman',
      roofing: 'roofing', hvac: 'hvac', plumbing: 'plumbing', electrical: 'electrical', handyman: 'handyman',
    }
    const engineTrade = tradeMap[trade.toLowerCase()] || 'handyman'
    const sel = 'owner_name, street_address, city, state, zip, lat, lng, home_value_est, year_built, owner_phone, lead_score, source_details'
    // 2026-06-12 per Peter ("no air balls") — the demo MUST land a real
    // fine-pressure homeowner, never a permit/311 guess. Pull the strongest
    // enforcement triggers first (hearings w/ a city fine, then active
    // violations, then failed inspections), ordered by urgency tier. Permit
    // and 311 are last-resort fallback only, used solely when the city+trade
    // has no genuine enforcement lead at all.
    // 2026-06-12 per Peter ("free lead must generate EVERY single time —
    // never show 'area opening soon'"). The old query hard-required an exact
    // city-string match (ilike city), so a "New York" contact never matched
    // leads stored as "Brooklyn"/"Manhattan", and a suburb contact missed
    // "Chicago" — both fell straight to the dead "opening soon" screen. Now
    // we WIDEN: exact city → state → anywhere, and enforcement → any trade,
    // landing the first real geocoded cited-homeowner we can find. With
    // thousands in the pool this effectively never comes up empty.
    const runQ = async (triggers: string[] | null, geo: 'city' | 'state' | 'any', withTrade: boolean) => {
      let q = supabase.from('leads').select(sel).not('lat', 'is', null).neq('source', 'aging_hvac')
      if (withTrade) q = q.contains('trade_match', [engineTrade])
      if (triggers) q = q.in('source_details->>trigger_type', triggers)
      // Phone-present first (the demo's punch is "call this number now"), then
      // most-urgent tier, then score.
      q = q.order('owner_phone', { ascending: true, nullsFirst: false })
           .order('source_details->>urgency_tier', { ascending: true })
           .order('lead_score', { ascending: false })
           .limit(25)
      if (geo === 'city' && city) q = q.ilike('city', city)
      else if (geo === 'state' && state) q = q.ilike('state', state)
      const { data } = await q
      return (data || [])
    }
    const ENF = ['hearings_case', 'violation', 'failed_inspection']
    // Tiered widening — stop at the first tier that returns a real lead.
    let pool = await runQ(ENF, 'city', true)
    if (!pool.length) pool = await runQ(null, 'city', true)   // any trade, same city
    if (!pool.length) pool = await runQ(ENF, 'state', true)   // cited, same state
    if (!pool.length) pool = await runQ(null, 'state', true)  // any, same state
    if (!pool.length) pool = await runQ(ENF, 'any', true)     // cited, this trade, anywhere
    if (!pool.length) pool = await runQ(ENF, 'any', false)    // any cited homeowner, anywhere
    if (!pool.length) pool = await runQ(null, 'any', false)   // last resort: any real lead

    // 2026-06-12 per Peter — 55% of enforcement parcels are owned by a
    // trust/LLC/INC, and showing "CHICAGO TITLE LAND TRUST CO A/T/U/T
    // #800..." as the "homeowner" reads like a database glitch and kills
    // the "real person you can call today" promise. PREFER a real-person
    // owner for the showcase (also a better lead — person-owned skews
    // owner-occupied, not commercial). Entity names get redacted below.
    type PoolLead = {
      owner_name: string | null; street_address: string | null; city: string | null; state: string | null; zip: string | null
      lat: number | null; lng: number | null; home_value_est: number | null; year_built: number | null
      owner_phone: string | null; source_details: { urgency_label?: string; description?: string; trigger_type?: string; fine_total?: number | string } | null
    }
    const ENTITY_OWNER = /\b(trust|llc|l\.l\.c|inc\b|incorporated|corp|company|\bco\b|bank|holdings|properties|associat|partners|\blp\b|trustee|a\/t\/u\/t|titleholder|cooperative|apartments)\b/i
    const isEntity = (n: string | null) => !!n && ENTITY_OWNER.test(n)
    const typed = pool as PoolLead[]
    // 2026-06-13 per Peter — EXCLUSIVITY. Picking pool[0] meant every
    // contractor in a city saw the SAME top lead, breaking the "never shared
    // with 4 other shops" promise. Spread the pool across contractors with a
    // deterministic biz_id offset: same contractor always sees the same lead
    // (stable), different contractors get different ones. Person-owned
    // candidates first; fall back to any addressed lead.
    const candidates = typed.filter((l) => l.street_address && !isEntity(l.owner_name))
    const fallback = typed.filter((l) => l.street_address)
    const offsetHash = parseInt(bizId.replace(/[^0-9a-f]/gi, '').slice(-6) || '0', 16) || 0
    const pickFrom = candidates.length ? candidates : fallback
    const poolLead = pickFrom.length ? pickFrom[offsetHash % pickFrom.length] as PoolLead : undefined

    if (poolLead && poolLead.street_address) {
      const value = poolLead.home_value_est
      const vm = trade.includes('roof') ? [0.020, 0.045] : trade.includes('hvac') ? [0.008, 0.018] : trade.includes('elect') ? [0.005, 0.015] : trade.includes('plumb') ? [0.004, 0.012] : [0.006, 0.020]
      const estJobMin = value ? Math.round((value * vm[0]) / 100) * 100 : null
      const estJobMax = value ? Math.round((value * vm[1]) / 100) * 100 : null
      const sd = poolLead.source_details
      const isEnf = sd?.trigger_type && sd.trigger_type !== 'permit' && sd.trigger_type !== '311'
      const fine = Number(sd?.fine_total || 0)
      const fineStr = fine > 0 ? `$${fine.toLocaleString('en-US')} city fine on file. ` : ''
      const signalDetail = sd?.urgency_label
        ? `${sd.urgency_label} — they have to get this done`
        : sd?.description
          ? `${fineStr}${sd.description.slice(0, 110)}`
          : (poolLead.year_built ? `Built ${poolLead.year_built}` : 'Flagged property in your area')

      await supabase.from('prospect_free_leads').update({
        // Enforcement leads (HPD etc.) have no public owner name — the real
        // name is skip-traced and unlocked at signup, same as the phone.
        // Entity owners (trust/LLC) are redacted to "Verified homeowner" —
        // never show "CHICAGO TITLE LAND TRUST CO A/T/U/T #800..." to a
        // contractor; it reads like junk and tanks the pitch.
        lead_owner_name: (poolLead.owner_name && !isEntity(poolLead.owner_name)) ? poolLead.owner_name : 'Verified homeowner',
        lead_street: poolLead.street_address,
        lead_year_built: poolLead.year_built,
        lead_value: value,
        lead_phone: redactPhone(poolLead.owner_phone),
        lead_signal: isEnf ? 'violation' : 'permit',
        lead_signal_detail: signalDetail,
        lead_est_job_min: estJobMin,
        lead_est_job_max: estJobMax,
        generation_completed_at: new Date().toISOString(),
        generation_failed_reason: null,
      }).eq('biz_id', bizId)

      const updated = await supabase.from('prospect_free_leads').select('*').eq('biz_id', bizId).maybeSingle()
      return NextResponse.json({
        ok: true, cached: false, source: 'pool',
        lead: { ...pluckLead(updated.data as Record<string, unknown>), lat: poolLead.lat, lng: poolLead.lng, city: poolLead.city, state: poolLead.state, zip: poolLead.zip, fine_total: fine > 0 ? fine : null, trigger: sd?.trigger_type || null },
      })
    }
  }

  // BatchData fallback — only reached if the pool returned nothing (rare).
  // The daily-spend gate lives HERE now, guarding only the paid call.
  const gate = await canSpendBatchData(PROPERTY_SEARCH_COST_CENTS)
  if (!gate.ok) {
    await supabase
      .from('prospect_free_leads')
      .update({ generation_failed_reason: `spend_cap:${gate.reason}` })
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

  // Coordinates: straight off the BatchData row when present, else geocode.
  const pickLat = typeof pick.address?.latitude === 'number' ? pick.address.latitude : null
  const pickLng = typeof pick.address?.longitude === 'number' ? pick.address.longitude : null
  const freshLoc = pickLat !== null && pickLng !== null
    ? { lat: pickLat, lng: pickLng }
    : await leadLatLngFromAddress(updated.data as Record<string, unknown>)

  return NextResponse.json({ ok: true, cached: false, lead: { ...pluckLead(updated.data as Record<string, unknown>), lat: freshLoc?.lat ?? null, lng: freshLoc?.lng ?? null } })
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

/**
 * 2026-06-11 — lat/lng for the demo-dashboard map pin on /free-lead.
 * prospect_free_leads has no coordinate columns (avoiding a migration):
 * fresh generations pass coords straight from the BatchData row; cached
 * hits geocode the stored address on the fly ($0.005, edge of free tier).
 */
async function leadLatLngFromAddress(row: Record<string, unknown>): Promise<{ lat: number; lng: number } | null> {
  const parts = [row.lead_street, row.city, row.state, row.zip].filter(Boolean).join(', ')
  if ((row.lead_street as string | null | undefined)?.trim() && parts.length >= 8) {
    try {
      const { geocodeBusinessAddress } = await import('@/lib/geocodeBusinessAddress')
      const g = await geocodeBusinessAddress(parts)
      if (g) return { lat: g.lat, lng: g.lng }
    } catch { /* map pin is progressive enhancement — never block the lead */ }
  }
  return null
}
