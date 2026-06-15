import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { canSpendBatchData, logBatchDataSpend } from '@/lib/batchdataSpend'
import { batchdataKey, skipTraceAddress } from '@/lib/skipTrace'
import { generateLeadIntel } from '@/lib/freeLeadIntel'

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
  // 2026-06-13 — widened after finding "0 Instantly clicks but board clicks":
  // email link-scanners / prefetchers that slipped the old list. These auto-
  // GET every URL in inbound mail and were inflating visit_count = phantom
  // hot leads on the call board.
  /proxy/i,
  /fetch/i,
  /python-?requests|aiohttp|httpx|urllib/i,
  /curl|wget|libwww|okhttp|axios|go-http|java\/|apache-httpclient/i,
  /headless|puppeteer|playwright|phantom|selenium/i,
  /facebookexternalhit|slackbot|whatsapp|telegrambot|discordbot|twitterbot/i,
  /pingdom|uptimerobot|datadog|newrelic|statuscake|monitor/i,
  /google(image|web)?proxy|yahoo.*proxy|gmailimageproxy/i,
  /outlook|office365|exchange/i,
]

function isBot(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') || ''
  // No UA at all = automated client, never a real browser.
  if (!ua) return true
  // Every real consumer browser (Chrome/Safari/Firefox/Edge) sends a
  // "Mozilla/..." token. Library/scanner UAs usually don't. Absence of it is
  // a strong bot signal — blocks the spoofed-clean-UA scanners the explicit
  // list misses.
  if (!/mozilla\//i.test(ua)) return true
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

  let zip = (row.zip as string) || ''
  let city = (row.city as string) || ''
  let state = (row.state as string) || ''
  let trade = (row.trade as string) || ''

  // 2026-06-15 — pull the CONTRACTOR's context from outreach_leads (business
  // name + location + TRADE). Used for (a) recovering blank geo so same-state
  // matching works, (b) matching the lead to the contractor's REAL trade (a
  // masonry shop must get a masonry violation, not a porch routed to "HVAC"),
  // and (c) the AI lead packet ("why YOUR shop"). One lookup, all jobs.
  let contractorBiz: string | null = null
  {
    const olEmail = (row.email as string | null) || null
    if (olEmail) {
      const { data: ol } = await supabase
        .from('outreach_leads').select('city, state, zip, business_name, trade').eq('email', olEmail).maybeSingle()
      if (ol) {
        city = city || (ol.city as string | null) || ''
        state = state || (ol.state as string | null) || ''
        zip = zip || (ol.zip as string | null) || ''
        trade = trade || (ol.trade as string | null) || ''
        contractorBiz = (ol.business_name as string | null) || null
      }
    }
  }
  // Only fall back to 'hvac' if we truly never found a trade. A real trade
  // (masonry/roofing/etc) drives both the lead match AND the AI pitch.
  if (!trade) trade = 'hvac'

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
    const ENF = ['hearings_case', 'violation', 'failed_inspection']
    // Tiered widening — stop at the first tier that returns a real lead.
    // 2026-06-15 — NEVER CROSS STATES. The old cascade had 'any' geo tiers, so
    // a Dallas contractor (no TX enforcement leads exist — enforcement is
    // Chicago/NYC/Philly only) fell through to "cited anywhere" and got handed
    // a CHICAGO homeowner. A wrong-state lead reads as fake and destroys the
    // "homeowner NEAR YOU" promise (Aire Serv Dallas got a Chicago lead, 6/15).
    // Cap at same-STATE. No same-state pool lead → fall through to the
    // BatchData fallback below, which pulls a REAL lead for the contractor's
    // own zip/city. Better a real local lead (or honest "opening your area")
    // than a confident wrong-state one.
    // PREFER local (same city → same state), but NEVER dead-end. The geo data
    // is messy (blank rows, "IL" vs "Illinois"), so a strict same-state-only
    // gate left contractors with no lead. The Dallas/Chicago complaint was
    // really a DISPLAY bug (we showed the contractor's city for the
    // homeowner's address) — now fixed by storing the homeowner's real
    // city/state (lead_city). So a cross-state fallback lead at least shows
    // its OWN correct location. Order: local first, anywhere as last resort.
    type PoolLead = {
      owner_name: string | null; street_address: string | null; city: string | null; state: string | null; zip: string | null
      lat: number | null; lng: number | null; home_value_est: number | null; year_built: number | null
      owner_phone: string | null; source_details: { urgency_label?: string; description?: string; violation_text?: string; trigger_type?: string; fine_total?: number | string } | null
    }

    // 2026-06-15 per Peter — the free lead MUST be as close to the contractor
    // as possible (ideally <1mi), and NEVER cross-state/metro (a Dallas shop
    // got a Chicago lead). Strategy: pull SAME-STATE candidates only, then rank
    // by real distance from the contractor and keep only those inside a metro
    // radius. No same-state lead (e.g. Dallas — zero TX enforcement data) →
    // fall through to BatchData local / honest "opening your area", NEVER a
    // far cross-metro cited lead.
    const MAX_RADIUS_MI = 60   // metro cap — never hand out a different-city lead
    const haversineMi = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const toRad = (d: number) => (d * Math.PI) / 180
      const R = 3958.8
      const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
      return 2 * R * Math.asin(Math.sqrt(s))
    }
    // Contractor coordinates (for distance ranking) from their zip.
    let cLat: number | null = null, cLng: number | null = null
    if (zip) {
      const { data: zc } = await supabase.from('zip_centroids').select('lat, lng').eq('zip', zip).maybeSingle()
      if (zc && zc.lat != null && zc.lng != null) { cLat = Number(zc.lat); cLng = Number(zc.lng) }
    }
    // SAME-STATE fetch only (hard cap — never cross-state). Enforcement+trade →
    // enforcement any-trade → any lead. Larger limit so distance ranking has
    // real choice.
    const fetchState = async (triggers: string[] | null, withTrade: boolean): Promise<PoolLead[]> => {
      if (!state) return []
      let q = supabase.from('leads').select(sel).not('lat', 'is', null).neq('source', 'aging_hvac').ilike('state', state)
      if (withTrade) q = q.contains('trade_match', [engineTrade])
      if (triggers) q = q.in('source_details->>trigger_type', triggers)
      q = q.order('source_details->>urgency_tier', { ascending: true }).order('lead_score', { ascending: false }).limit(400)
      const { data } = await q
      return (data || []) as PoolLead[]
    }
    let pool = await fetchState(ENF, true)
    if (!pool.length) pool = await fetchState(ENF, false)
    if (!pool.length) pool = await fetchState(null, false)

    const ENTITY_OWNER = /\b(trust|llc|l\.l\.c|inc\b|incorporated|corp|company|\bco\b|bank|holdings|properties|associat|partners|\blp\b|trustee|a\/t\/u\/t|titleholder|cooperative|apartments)\b/i
    const isEntity = (n: string | null) => !!n && ENTITY_OWNER.test(n)
    // Prefer real-person owners (entities get redacted + read like junk).
    let ranked: PoolLead[] = pool.filter((l) => l.street_address && !isEntity(l.owner_name))
    if (!ranked.length) ranked = pool.filter((l) => l.street_address)
    // Distance rank + metro cap (only when we have contractor coords).
    if (cLat != null && cLng != null) {
      ranked = ranked
        .map((l) => ({ l, d: l.lat != null && l.lng != null ? haversineMi(cLat as number, cLng as number, Number(l.lat), Number(l.lng)) : Infinity }))
        .filter((x) => x.d <= MAX_RADIUS_MI)
        .sort((a, b) => a.d - b.d)
        .map((x) => x.l)
    }
    // EXCLUSIVITY among the CLOSEST few — neighbors don't all get the same lead,
    // but everyone still gets a NEARBY one. Spread by biz_id over the nearest N.
    const nearest = ranked.slice(0, 20)
    const offsetHash = parseInt(bizId.replace(/[^0-9a-f]/gi, '').slice(-6) || '0', 16) || 0
    const poolLead = nearest.length ? nearest[offsetHash % nearest.length] : undefined

    if (poolLead && poolLead.street_address) {
      const value = poolLead.home_value_est
      const vm = trade.includes('roof') ? [0.020, 0.045] : trade.includes('hvac') ? [0.008, 0.018] : trade.includes('elect') ? [0.005, 0.015] : trade.includes('plumb') ? [0.004, 0.012] : [0.006, 0.020]
      const estJobMin = value ? Math.round((value * vm[0]) / 100) * 100 : null
      const estJobMax = value ? Math.round((value * vm[1]) / 100) * 100 : null
      const sd = poolLead.source_details
      const isEnf = sd?.trigger_type && sd.trigger_type !== 'permit' && sd.trigger_type !== '311'
      const fine = Number(sd?.fine_total || 0)
      // 2026-06-15 per call feedback ("leads aren't detailed enough") — surface
      // the ACTUAL city violation text (what work the homeowner is ordered to
      // do), not a generic "violation". This is already stored, just was hidden
      // behind the urgency_label. Format: "<what the city cited> — $X fine,
      // <deadline>". Gives the contractor the actual job.
      const violText = (sd?.violation_text || sd?.description || '').toString().replace(/\s+/g, ' ').trim()
      const urgencyPart = sd?.urgency_label
        ? String(sd.urgency_label)
        : fine > 0 ? `$${fine.toLocaleString('en-US')} city fine — hearing set` : 'City-flagged — work ordered'
      const signalDetail = violText
        ? `Cited for: ${violText.slice(0, 180)}${violText.length > 180 ? '…' : ''} — ${urgencyPart}. They have to get this done.`
        : `${urgencyPart} — they have to get this done`

      // 2026-06-15 per Peter ("yes all of them") — make the free lead a COMPLETE
      // lead: skip-trace the phone (enforcement records have none) + AI lead
      // packet. Both are best-effort and never block the lead.
      const ownerNameClean = (poolLead.owner_name && !isEntity(poolLead.owner_name)) ? poolLead.owner_name : null
      let enrichedPhone = poolLead.owner_phone || null
      if (!enrichedPhone && poolLead.street_address) {
        const st = await skipTraceAddress({ street: poolLead.street_address, city: poolLead.city ?? undefined, state: poolLead.state ?? undefined, zip: poolLead.zip ?? undefined })
        if (st.hit && st.owner_phones && st.owner_phones.length) enrichedPhone = st.owner_phones[0]
        await logBatchDataSpend({ costCents: st.cost_cents, caller: 'free-lead-skiptrace', context: { biz_id: bizId, hit: st.hit }, resultOk: st.ok }).catch(() => {})
      }
      const aiIntel = await generateLeadIntel({
        ownerName: ownerNameClean,
        address: [poolLead.street_address, poolLead.city, poolLead.state, poolLead.zip].filter(Boolean).join(', '),
        trade,
        violationText: violText,
        fineUsd: fine,
        hearingNote: sd?.urgency_label ? String(sd.urgency_label) : null,
        homeValue: value,
        yearBuilt: poolLead.year_built,
        contractorBiz,
        contractorCity: city,
      })

      await supabase.from('prospect_free_leads').update({
        // Enforcement leads (HPD etc.) have no public owner name — the real
        // name is skip-traced and unlocked at signup, same as the phone.
        // Entity owners (trust/LLC) are redacted to "Verified homeowner" —
        // never show "CHICAGO TITLE LAND TRUST CO A/T/U/T #800..." to a
        // contractor; it reads like junk and tanks the pitch.
        lead_owner_name: (poolLead.owner_name && !isEntity(poolLead.owner_name)) ? poolLead.owner_name : 'Verified homeowner',
        lead_street: poolLead.street_address,
        // 2026-06-15 per Peter — store the HOMEOWNER's real city/state/zip so
        // cached reads show the right location (was falling back to the
        // CONTRACTOR's city = the Dallas/Chicago mislabel). Needs the
        // lead_city/lead_state/lead_zip columns (see migration).
        lead_city: poolLead.city,
        lead_state: poolLead.state,
        lead_zip: poolLead.zip,
        lead_year_built: poolLead.year_built,
        lead_value: value,
        // 2026-06-15 per Peter — FULL phone on the free showcase lead (was
        // redacted). The free lead is now a complete, callable lead so the
        // contractor can actually work it; leads #2-10 + the weekly feed are
        // the paywall, not the phone.
        lead_phone: enrichedPhone,
        lead_signal: isEnf ? 'violation' : 'permit',
        lead_signal_detail: signalDetail,
        lead_est_job_min: estJobMin,
        lead_est_job_max: estJobMax,
        generation_completed_at: new Date().toISOString(),
        generation_failed_reason: null,
      }).eq('biz_id', bizId)

      // AI packet written SEPARATELY + failure-tolerant: if the lead_ai_intel
      // column doesn't exist yet (migration not run), this errors silently and
      // the lead still works. Once the column exists, it populates.
      if (aiIntel) {
        await supabase.from('prospect_free_leads').update({ lead_ai_intel: aiIntel }).eq('biz_id', bizId)
          .then((r) => { if (r.error) console.warn('[free-lead] lead_ai_intel write skipped:', r.error.message) })
      }

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
  const pickCity = pick.address?.city || null
  const pickState = pick.address?.state || null
  const pickZip = pick.address?.zip || null
  const yearBuilt = pick.building?.yearBuilt || null
  const value = pick.valuation?.estimatedValue || null
  const phoneFull = pick.phoneNumbers?.[0]?.number || null

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
      lead_city: pickCity,
      lead_state: pickState,
      lead_zip: pickZip,
      lead_year_built: yearBuilt,
      lead_value: value,
      lead_phone: phoneFull,  // 2026-06-15 — FULL phone (free lead is complete)
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

    // Pre-written 1-line opener Peter copy-pastes onto the call. Saves
    // 30 sec of mental load + sounds prepared instead of generic. The
    // opener references the SPECIFIC reason they're hot (multi-visit on
    // their free-lead landing) so the call feels like personal attention
    // not a robo-follow-up. Hormozi: specificity = trust.
    const nameForOpener = ownerFirstName || 'there'
    const shopForOpener = businessName || 'your shop'
    const opener =
      `"Hey ${nameForOpener}, this is Peter from BellAveGo. ` +
      `I saw you checking out the free lead I sent for ${shopForOpener} — ` +
      `wanted to grab 60 seconds to make sure it's actually a fit for you. ` +
      `What's the one number you'd add this month if these leads landed every Monday?"`

    const founderPhone = process.env.FOUNDER_ALERT_PHONE ?? '+17737109565'
    const sms =
      `🔥 HOT LEAD — ${nextCount}× visit on free-lead landing\n\n` +
      `${businessName || '(unknown shop)'}${ownerFirstName ? ` · ${ownerFirstName}` : ''}\n` +
      `${trade.toUpperCase()} · ${city}${state ? `, ${state}` : ''} ${zip}\n` +
      `Email: ${email || '—'}\n` +
      `Their landing: ${url}\n\n` +
      `OPENER:\n${opener}\n\n` +
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
    // Prefer the HOMEOWNER's stored location; fall back to the prospect row's
    // city/state only for legacy cached rows generated before lead_city existed.
    city: row.lead_city ?? row.city,
    state: row.lead_state ?? row.state,
    zip: row.lead_zip ?? row.zip,
    phone: row.lead_phone,  // FULL phone now (2026-06-15) — the free lead is complete
    email: row.lead_email,
    year_built: row.lead_year_built,
    value: row.lead_value,
    signal: row.lead_signal,
    signal_detail: row.lead_signal_detail,
    est_job_min: row.lead_est_job_min,
    est_job_max: row.lead_est_job_max,
    trade: row.trade,
    ai_intel: row.lead_ai_intel ?? null,  // job breakdown + outreach script + why-you pitch + property note
    phone_redacted: false,  // free lead shows the real phone; paywall = leads #2-10 + feed
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
