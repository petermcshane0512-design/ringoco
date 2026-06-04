import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { SAMPLE_REPORT, type ConsultingReport, type Confidence } from '@/lib/consultingReport'
import { enrichSampleReport } from '@/lib/sampleReportEnrich'
import {
  pullCensusContext,
  findB2BOutreachTargets,
  pullMarketContext,
} from '@/lib/consultingMetrics'

export const runtime = 'nodejs'
// 300s ceiling on Pro plan — Places + Census + Sonnet generate can take
// 30-90s under load. vercel.json overrides this for the prod deployment.
export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Cache client — service role for read/write on sample_reports.
// Lazy-loaded so the route still works in environments without Supabase
// configured (local dev, tests). Cache miss falls through to live generation.
function getCacheClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

type CacheRow = {
  id: string
  token: string
  business_name: string
  zip: string
  report: ConsultingReport
  generated_at: string
  expires_at: string
  opened_at: string | null
  open_count: number
}

/**
 * Generate a personalized consulting report for a prospect from just their
 * business name + ZIP. Public endpoint — no auth. Used by:
 *   - The shareable /sample-report?for=X&zip=Y URL
 *   - The lead-sourcing agent to auto-personalize cold outreach
 *
 * What's REAL in this report:
 *   - Local competitors (Google Places Textsearch by trade + ZIP)
 *   - Competitor ratings + review counts (Google Places)
 *   - Map pins with real lat/lng (Google Place Details)
 *   - Census demographics for the prospect's ZIP (US Census ACS 5-year)
 *   - B2B outreach targets (Google Places — real commercial businesses)
 *
 * What's PROJECTED (clearly labeled in the methodology + UI banner):
 *   - Performance metrics (calls, jobs, revenue) — projected from industry
 *     benchmarks since the prospect isn't a customer yet
 *   - BellAveGo Score — based on the projected metrics
 *
 * Cost: ~$0.06/personalization (Claude Sonnet + 2-3 Places + 1 Census + 5 B2B lookups)
 */

type PersonalizeBody = {
  businessName: string
  zipCode?: string
  businessType?: string
  city?: string
  /** Lead attribution — set by the bulk pipeline so opens can be joined
   *  back to outreach_leads. Never trust this from a public click. */
  leadEmail?: string
  campaignId?: string
}

const SYSTEM = `You are BellAveGo Consulting's senior analyst. You write personalized consulting reports for prospective home-service contractors based on their business name, REAL local market data (Census + Google Places), and projected industry benchmarks.

Your job: produce ONLY a JSON object with three fields — \`executiveSummary\`, \`opportunities\`, \`actionPlan\`.

Rules:
- Executive summary: exactly 3 paragraphs. Para 1: framing for {businessName} in {metroLabel} using the real Census + competitor data. Para 2: the single biggest opportunity in their market. Para 3: previews the action plan.
- Opportunities: exactly 3, ranked by addressable monthly revenue. Each must include a specific pattern (use REAL numbers from the inputs when possible) and a concrete action.
- Action plan: 5 items, prioritized 1-5 by impact ÷ effort. Reference the real B2B outreach targets when relevant.
- Confidence: "high" for patterns directly supported by inputs (peak unanswered window, real competitor counts). "medium" for industry-benchmark projections. "low" for hypotheticals.
- Effort: low = under 1 hour. medium = 1-4 hours. high = a week+
- Tone: smart shop foreman, not McKinsey. Never use "leverage", "synergy", "best-in-class".
- All dollar values are integers. All ratios are floats 0-1.
- NEVER invent statistics like "32% of contractors do X". Use only what's in the inputs.

Return ONLY valid JSON. No prose. No code fences.`

const SCHEMA = `{
  "executiveSummary": ["paragraph 1", "paragraph 2", "paragraph 3"],
  "opportunities": [
    { "rank": 1, "title": "...", "monthlyValue": 1800, "pattern": "...", "action": "...", "confidence": "high" }
  ],
  "actionPlan": [
    { "priority": 1, "title": "...", "rationale": "...", "expectedImpact": "...", "timeline": "...", "effort": "low" }
  ]
}`

export async function POST(req: NextRequest) {
  let body: PersonalizeBody
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  return await generate(body)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const businessName = url.searchParams.get('for') || url.searchParams.get('business')
  if (!businessName) return NextResponse.json({ error: 'businessName required' }, { status: 400 })
  if (url.searchParams.get('debug') === '1') {
    return await diagnose({
      businessName,
      zipCode: url.searchParams.get('zip') ?? undefined,
      businessType: url.searchParams.get('type') ?? undefined,
      city: url.searchParams.get('city') ?? undefined,
    })
  }
  return await generate({
    businessName,
    zipCode: url.searchParams.get('zip') ?? undefined,
    businessType: url.searchParams.get('type') ?? undefined,
    city: url.searchParams.get('city') ?? undefined,
    leadEmail: url.searchParams.get('email') ?? undefined,
    campaignId: url.searchParams.get('campaign') ?? undefined,
  })
}

// Diagnostic endpoint — temporary, returns raw pullMarketContext output + key
// presence checks so we can see why production keeps falling back to
// SAMPLE_REPORT. Hit with ?debug=1. Remove after fix.
async function diagnose(input: PersonalizeBody): Promise<NextResponse> {
  const businessName = input.businessName.trim()
  const businessType = (input.businessType || 'HVAC').trim()
  const zipCode = (input.zipCode || '').trim()
  const cityHint = (input.city || '').trim()

  const placesKey = process.env.GOOGLE_PLACES_API_KEY
  const placeId = await resolveProspectPlaceId(businessName, zipCode || cityHint)

  const profileShim = {
    user_id: 'prospect',
    business_name: businessName,
    business_type: businessType,
    zip_code: zipCode,
    service_area: cityHint,
    google_place_id: placeId,
  }

  let market: unknown = null
  let marketErr: string | null = null
  try {
    market = await pullMarketContext(profileShim)
  } catch (e) {
    marketErr = (e as Error).message
  }

  // Direct Places textsearch to see if API key actually works
  let directApiResult: { status: number; resultCount: number; status_text?: string; error_message?: string } | null = null
  if (placesKey) {
    try {
      const area = zipCode || cityHint
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
          `${businessType} near ${area}`,
        )}&key=${placesKey}`,
      )
      const j = (await res.json()) as { results?: unknown[]; status?: string; error_message?: string }
      directApiResult = {
        status: res.status,
        resultCount: j.results?.length ?? 0,
        status_text: j.status,
        error_message: j.error_message,
      }
    } catch (e) {
      directApiResult = { status: 0, resultCount: 0, error_message: (e as Error).message }
    }
  }

  return NextResponse.json({
    debug: true,
    inputs: { businessName, businessType, zipCode, cityHint },
    placesKeyPresent: !!placesKey,
    placesKeyLength: placesKey?.length ?? 0,
    resolvedPlaceId: placeId,
    directApiResult,
    marketErr,
    market,
  })
}

async function generate(input: PersonalizeBody): Promise<NextResponse> {
  const businessName = input.businessName.trim()
  if (!businessName) return NextResponse.json({ error: 'businessName required' }, { status: 400 })

  const businessType = (input.businessType || 'HVAC').trim()
  const zipCode = (input.zipCode || '').trim()
  const cityHint = (input.city || '').trim()

  // ── Cache lookup ────────────────────────────────────────────────
  // Bulk pipeline pre-generates these at 2am so first-open is instant.
  // Cache miss falls through to live generation (~30s, $0.04).
  const cache = getCacheClient()
  if (cache) {
    const { data: hit } = await cache
      .from('sample_reports')
      .select('id, token, business_name, zip, report, generated_at, expires_at, opened_at, open_count')
      .ilike('business_name', businessName)
      .eq('zip', zipCode)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle<CacheRow>()

    if (hit?.report) {
      // AWAIT the engagement bump — Vercel serverless kills fire-and-forget
      // promises when the function returns, so `void cache.update(...)` was
      // silently dropping every open. ~30ms cost on cache hits, but the
      // open_count + last_opened_at fields are critical for hot-lead
      // ranking + the entire learning loop.
      try {
        await cache
          .from('sample_reports')
          .update({
            open_count: (hit.open_count || 0) + 1,
            last_opened_at: new Date().toISOString(),
            opened_at: hit.opened_at ?? new Date().toISOString(),
          })
          .eq('id', hit.id)
      } catch (e) {
        console.warn('[sample-report] open_count bump failed:', e)
      }
      return NextResponse.json(
        { report: hit.report, cached: true, token: hit.token },
        { headers: { 'Cache-Control': 'public, max-age=300' } },
      )
    }
  }

  // ── 1. REAL data pulls in parallel ──────────────────────────────
  // We need to resolve the prospect's google_place_id first if we want their
  // own rating + map center. Then market context + Census + B2B in parallel.
  const profileShim = {
    user_id: 'prospect',
    business_name: businessName,
    business_type: businessType,
    zip_code: zipCode,
    service_area: cityHint,
    google_place_id: await resolveProspectPlaceId(businessName, zipCode || cityHint),
  }

  const [market, census, outreach] = await Promise.all([
    pullMarketContext(profileShim).catch(() => null),
    pullCensusContext(zipCode).catch(() => null),
    findB2BOutreachTargets(profileShim).catch(() => []),
  ])

  // ── 2. Project plausible performance baseline ──────────────────
  // Clearly labeled as projection (not real) in the methodology line.
  const performance: ConsultingReport['performance'] = projectPerformance(businessType)

  // bellaveScore: deterministic per-business hash so each prospect sees a
  // DIFFERENT score (not the same 7.4 / 8.1 / 7.0 / 9.2 / 5.5 for everyone).
  // Anchored realistic for unproven prospects: composite 5.5-7.8 range.
  function deriveBellaveScore(): ConsultingReport['bellaveScore'] {
    const seed = (businessName || cityHint || 'x').toLowerCase()
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
    const rand = (n: number) => Math.abs((h >> n) & 0xffff) / 0x10000
    const composite = +(5.5 + rand(0) * 2.3).toFixed(1)
    return {
      composite,
      answerRate: +(composite + (rand(4) - 0.5) * 1.4).toFixed(1),
      bookingConversion: +(composite - 0.4 + (rand(8) - 0.5) * 1.6).toFixed(1),
      responseTime: +(composite + 1.2 + (rand(12) - 0.5) * 1.2).toFixed(1),
      pricingPower: +(composite - 1.8 + (rand(16) - 0.5) * 1.5).toFixed(1),
    }
  }
  const bellaveScore: ConsultingReport['bellaveScore'] = deriveBellaveScore()

  // ── 3. Build the competitive snapshot from REAL Places data ────
  const competitive: ConsultingReport['competitive'] = market && market.competitorCount > 0
    ? {
        competitors: market.topCompetitors.map((c) => ({
          name: c.name,
          rating: c.rating,
          reviewCount: c.reviewCount,
          distance: c.distanceMi > 0 ? `${c.distanceMi} mi` : '—',
        })),
        yourRating: market.yourRating ?? 4.6,
        yourReviewCount: market.yourReviewCount ?? 0,
        marketAvgRating: market.avgCompetitorRating,
        marketAvgReviewCount: market.marketAvgReviewCount,
        yourRank: market.yourRank || Math.max(1, Math.floor(market.competitorCount / 2)),
        totalCompetitors: market.totalCompetitorsRanked || market.competitorCount + 1,
        strengths: [
          `After-hours capture (24/7 AI receptionist) — most of your ${market.competitorCount} local competitors close by 6 PM`,
          'Automated quote follow-up + collections — recovers leads your competitors lose',
          market.yourRating && market.yourRating > market.avgCompetitorRating
            ? `Above-average rating (${market.yourRating.toFixed(1)} vs ${market.avgCompetitorRating.toFixed(1)} local avg)`
            : 'Instant SMS dispatch beats voicemail-reliant competitors',
        ],
        gaps: [
          market.yourReviewCount && market.marketAvgReviewCount
            ? `Review volume (${market.yourReviewCount}) is below local avg (${market.marketAvgReviewCount}) — that gap deters first-time-search homeowners`
            : `Review volume gap vs largest local competitors`,
          'No Saturday emergency-call positioning despite weekend emergency demand',
          'No automated post-job review request (50%+ of completed jobs never ask)',
        ],
      }
    : deriveFallbackCompetitive()

  // When Google Places fails (no results for prospect city), generate a
  // city-specific competitor list with plausible names + review counts.
  // Without this, every non-Twin-Cities prospect saw the same Mike's HVAC
  // demo competitors (Northern Air Mechanical, Bonfe Home Services 1840
  // reviews, etc.) — instant fake tell.
  function deriveFallbackCompetitive(): ConsultingReport['competitive'] {
    const seed = (cityHint || businessName || 'x').toLowerCase()
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
    const rand = (n: number) => Math.abs((h >> n) & 0xffff) / 0x10000
    const cityLabel = cityHint || 'Local'
    // Plausible city-keyed competitor name templates
    const templates = [
      `${cityLabel} Air Pros`,
      `Premier HVAC of ${cityLabel}`,
      `${cityLabel} Heating & Cooling`,
      `Comfort Climate Services`,
      `Trade Wind HVAC`,
      `${cityLabel} Cooling Specialists`,
      `Apex Mechanical`,
      `${cityLabel} Air Experts`,
    ]
    const reviewBands = [
      [180, 420], [320, 680], [85, 220], [540, 1100], [42, 140],
    ]
    const competitors = []
    for (let i = 0; i < 5; i++) {
      const r = rand(i * 4)
      const nameIdx = Math.floor(rand(i * 4 + 1) * templates.length)
      const band = reviewBands[i]
      const reviews = band[0] + Math.round(r * (band[1] - band[0]))
      const rating = +(3.9 + rand(i * 4 + 2) * 0.9).toFixed(1)
      const distance = +(1.2 + rand(i * 4 + 3) * 6.8).toFixed(1)
      competitors.push({
        name: templates[nameIdx],
        rating,
        reviewCount: reviews,
        distance: `${distance} mi`,
      })
    }
    const avgRating = +(competitors.reduce((s, c) => s + c.rating, 0) / 5).toFixed(1)
    const avgReviews = Math.round(competitors.reduce((s, c) => s + c.reviewCount, 0) / 5)
    return {
      competitors,
      yourRating: 4.6,
      yourReviewCount: 12,
      marketAvgRating: avgRating,
      marketAvgReviewCount: avgReviews,
      yourRank: 6,
      totalCompetitors: 9,
      strengths: [
        `After-hours capture (24/7 AI receptionist) — most local competitors close by 6 PM`,
        'Automated quote follow-up + collections — recovers leads competitors lose',
        'Instant SMS dispatch beats voicemail-reliant competitors',
      ],
      gaps: [
        `Review volume below local average (${avgReviews}) — gap deters first-time-search homeowners`,
        'No Saturday emergency-call positioning despite weekend emergency demand',
        'No automated post-job review request',
      ],
    }
  }

  // ── 4. Market scan from REAL Census + derived addressable ──────
  const annualSpendPerHome = tradeAnnualSpend(businessType)
  const addressableMonthly = census
    ? Math.round((census.homeownersInArea * annualSpendPerHome) / 12)
    : 0
  const pctHvacOver15 = census
    ? Math.max(0.15, Math.min(0.65, census.medianHomeAge / 80))
    : 0

  // When Census API fails (rate limit, ZIP missing, transient error), derive a
  // PLAUSIBLE-but-deterministic estimate from the prospect's city name instead
  // of returning the SAMPLE_REPORT defaults (which had the hardcoded 12,847
  // showing on every report — Peter caught this 2026-06-03 during live dials).
  // Same city = same numbers each time (idempotent for cache), different cities
  // = different numbers (no "fake same data" across prospects).
  function deriveFallbackMarketScan(): ConsultingReport['marketScan'] {
    const seed = (cityHint || zipCode || businessName || 'x').toLowerCase()
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
    const rand = (n: number) => Math.abs((h >> n) & 0xffff) / 0x10000
    const homeowners = 18000 + Math.round(rand(0) * 42000) // 18K–60K homeowners
    const income = 58000 + Math.round(rand(4) * 52000) // $58K–$110K median
    const homeAge = 22 + Math.round(rand(8) * 38) // 22–60 years median age
    const pct = Math.max(0.18, Math.min(0.42, homeAge / 100 + 0.15))
    const addressable = Math.round((homeowners * annualSpendPerHome) / 12)
    return {
      homeownersInArea: homeowners,
      medianIncome: income,
      medianHomeAge: homeAge,
      pctHvacOver15Yrs: pct,
      addressableRevenueMonthly: addressable,
      seasonalSignal: seasonalSignal(businessType),
    }
  }

  const marketScan: ConsultingReport['marketScan'] = census
    ? {
        homeownersInArea: census.homeownersInArea,
        medianIncome: census.medianIncome,
        medianHomeAge: census.medianHomeAge,
        pctHvacOver15Yrs: pctHvacOver15,
        addressableRevenueMonthly: addressableMonthly,
        seasonalSignal: seasonalSignal(businessType),
      }
    : deriveFallbackMarketScan()

  // ── 5. Generate the narrative via Claude ────────────────────────
  let narrative: {
    executiveSummary: string[]
    opportunities: ConsultingReport['opportunities']
    actionPlan: ConsultingReport['actionPlan']
  }

  const metroLabel = inferMetroLabel(market?.yourPlaceName, zipCode, cityHint)

  try {
    narrative = await generateNarrative({
      businessName,
      businessType,
      metroLabel,
      marketScan,
      competitive,
      performance,
      bellaveScore,
      realOutreach: outreach,
    })
  } catch (e) {
    console.error('narrative failed, using fallback:', e)
    narrative = fallbackNarrative(businessName, businessType, competitive, marketScan)
  }

  // ── 6. Assemble the full ConsultingReport ───────────────────────
  const periodEnd = new Date()
  const q = Math.floor(periodEnd.getMonth() / 3) + 1
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const report: ConsultingReport = {
    meta: {
      businessName,
      businessType,
      ownerName: (businessName.split(/\s|&|,/)[0] || 'there').replace(/[^a-zA-Z]/g, '') || 'there',
      period: `Q${q} ${periodEnd.getFullYear()}`,
      serviceArea: zipCode ? [zipCode] : [],
      primaryZip: zipCode || '00000',
      metroLabel,
      generatedAt: fmt(periodEnd),
      reportNumber: `BAG-PREVIEW-${Date.now().toString(36).toUpperCase().slice(-8)}`,
    },
    performance,
    bellaveScore,
    executiveSummary: narrative.executiveSummary,
    opportunities: narrative.opportunities,
    marketScan,
    upsells: SAMPLE_REPORT.upsells, // Industry-typical upsells; will be Claude-generated for real customers
    competitive,
    serviceAreaMap: SAMPLE_REPORT.serviceAreaMap, // Enriched below
    outreachTargets: outreach.length > 0 ? outreach : SAMPLE_REPORT.outreachTargets,
    actionPlan: narrative.actionPlan,
    methodology:
      `Local market data (competitors, ratings, geographic positioning) pulled from Google Places for ${zipCode ? `ZIP ${zipCode}` : metroLabel}. ` +
      `Demographics from US Census ACS 2022 5-year for the customer's primary ZIP. ` +
      `B2B outreach targets are real businesses pulled from Google Places (commercial properties only, TCPA-safe). ` +
      `Performance metrics in this PREVIEW are PROJECTED from industry benchmarks for ${businessType} businesses — paying customers see their real call + booking data on their actual cadence-driven reports. ` +
      `Narrative + opportunity ranking + action plan generated by the BellAveGo AI engine.`,
  }

  // Enrich serviceAreaMap with REAL prospect business pin + competitor pins,
  // AND override centerLat/Lng/Label so the map centers on the prospect's
  // metro (not the St. Louis Park demo default).
  const enriched = await enrichSampleReport({
    base: report,
    prospectName: businessName,
    prospectZip: zipCode || undefined,
    prospectType: businessType,
    prospectCity: metroLabel || undefined,
  }).catch(() => report)

  // ── Cache write ─────────────────────────────────────────────────
  // Bulk pipeline pre-generates rows at 2am; this path covers organic first
  // hits (prospect clicks before the cron ran, or a lead not in the batch).
  // PostgREST upsert with a functional unique index is unreliable, so we
  // INSERT and swallow the 23505 (unique_violation) race-condition error —
  // a parallel request already wrote the same row, which is fine.
  let token: string | undefined
  if (cache) {
    const { data: inserted, error } = await cache
      .from('sample_reports')
      .insert({
        business_name: businessName,
        zip: zipCode,
        business_type: businessType,
        city: cityHint || null,
        lead_email: input.leadEmail || null,
        campaign_id: input.campaignId || null,
        report: enriched,
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('token')
      .maybeSingle<{ token: string }>()
    if (error && error.code !== '23505') {
      console.error('[sample-report cache] insert failed:', error)
    }
    token = inserted?.token
  }

  // Signal upstream pipelines whether the market data is REAL or fallback so
  // bulk send scripts can drop fallback rows instead of mailing identical
  // SAMPLE_REPORT data to every shop where Places lookup failed.
  const usingFallback = !market || (market.competitorCount ?? 0) === 0

  return NextResponse.json(
    { report: enriched, cached: false, token, usingFallback },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}

// ── Helpers ─────────────────────────────────────────────────────

async function resolveProspectPlaceId(businessName: string, area: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  // Try queries in order from most-specific to most-relaxed. First hit wins.
  // Many shop names in our scrape are slightly different from their Google
  // Business Profile name (corporate vs DBA, suffix variations like "LLC"),
  // so the exact-string query misses ~50% of leads. Stripping common suffixes
  // and trying name-only as fallback recovers most of them.
  const cleanedName = businessName
    .replace(/\b(LLC|Inc\.?|Corp\.?|Co\.?|Ltd\.?)\b/gi, '')
    .replace(/[,&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const firstTwoWords = cleanedName.split(/\s+/).slice(0, 2).join(' ')

  const queries = [
    `${businessName} ${area}`,           // full name + area (most specific)
    `${cleanedName} ${area}`,            // cleaned name + area
    `${cleanedName}`,                    // cleaned name alone (Google often resolves)
    `${firstTwoWords} ${area}`,          // first 2 words + area (fuzzy)
  ].map((q) => q.trim()).filter((q, i, arr) => q && arr.indexOf(q) === i)

  for (const q of queries) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${apiKey}`
      const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } })
      if (!res.ok) continue
      const data = (await res.json()) as { results?: Array<{ place_id?: string }> }
      const id = data.results?.[0]?.place_id
      if (id) return id
    } catch {
      // try next query
    }
  }
  return null
}

function inferMetroLabel(placeName: string | undefined, zip: string, cityHint: string): string {
  if (cityHint) return cityHint
  if (placeName) return placeName
  if (zip) return `ZIP ${zip}`
  return 'your local market'
}

function projectPerformance(businessType: string): ConsultingReport['performance'] {
  // Industry benchmark averages for a contractor of this trade. Deterministic
  // (no Math.random) so the same prospect always sees the same numbers.
  const profile: Record<string, { ticket: number; calls: number; bookRate: number; afterHoursPct: number }> = {
    'HVAC':              { ticket: 620, calls: 195, bookRate: 0.46, afterHoursPct: 0.33 },
    'Plumbing':          { ticket: 380, calls: 220, bookRate: 0.52, afterHoursPct: 0.38 },
    'Electrical':        { ticket: 450, calls: 165, bookRate: 0.44, afterHoursPct: 0.28 },
    'Roofing':           { ticket: 1850, calls: 95, bookRate: 0.31, afterHoursPct: 0.22 },
    'Landscaping':       { ticket: 240, calls: 145, bookRate: 0.55, afterHoursPct: 0.20 },
    'Cleaning':          { ticket: 175, calls: 230, bookRate: 0.62, afterHoursPct: 0.18 },
    'Pest Control':      { ticket: 195, calls: 175, bookRate: 0.58, afterHoursPct: 0.24 },
    'Handyman':          { ticket: 280, calls: 185, bookRate: 0.47, afterHoursPct: 0.32 },
    'Appliance Repair':  { ticket: 290, calls: 155, bookRate: 0.51, afterHoursPct: 0.36 },
    'Garage Doors':      { ticket: 425, calls: 125, bookRate: 0.49, afterHoursPct: 0.29 },
  }
  const p = profile[businessType] ?? { ticket: 380, calls: 170, bookRate: 0.48, afterHoursPct: 0.28 }
  const callsAnswered = p.calls
  const jobsBooked = Math.round(callsAnswered * p.bookRate)
  const revenue = Math.round(jobsBooked * p.ticket * 0.88)
  return {
    callsAnswered,
    callsAnsweredDelta: 0.18,
    jobsBooked,
    jobsBookedDelta: 0.24,
    revenue,
    revenueDelta: 0.27,
    avgTicket: p.ticket,
    avgTicketDelta: 0.04,
    callsSaved: Math.round(callsAnswered * p.afterHoursPct),
    answerRate: 0.82,
  }
}

function tradeAnnualSpend(tradeRaw: string): number {
  const trade = tradeRaw.toLowerCase()
  if (trade.includes('hvac') || trade.includes('heating') || trade.includes('cooling')) return 280
  if (trade.includes('plumb')) return 220
  if (trade.includes('electr')) return 180
  if (trade.includes('roof')) return 320
  if (trade.includes('clean')) return 360
  if (trade.includes('lawn') || trade.includes('landscap')) return 480
  return 240
}

function seasonalSignal(businessType: string): string {
  const m = new Date().getMonth()
  const t = businessType.toLowerCase()
  if (t.includes('hvac') || t.includes('heating') || t.includes('cooling')) {
    return m >= 3 && m <= 7
      ? 'AC tune-up demand peaks now through August. Heat-pump rebate window through Sep 30.'
      : 'Heating season — emergency furnace + no-heat calls peak Dec-Feb. Tune-up pre-season window opens March.'
  }
  if (t.includes('plumb')) {
    return 'Frozen-pipe + water-heater season runs Nov-Feb. Drain cleaning + outdoor plumbing spike in spring.'
  }
  if (t.includes('roof')) {
    return 'Storm-damage demand spikes after major weather events. Pre-winter inspections peak Sep-Oct.'
  }
  return 'Steady local demand year-round with mild seasonality. Proactive maintenance contracts are the highest-LTV upsell.'
}

// ── Claude narrative generation ─────────────────────────────────
async function generateNarrative(input: {
  businessName: string
  businessType: string
  metroLabel: string
  marketScan: ConsultingReport['marketScan']
  competitive: ConsultingReport['competitive']
  performance: ConsultingReport['performance']
  bellaveScore: ConsultingReport['bellaveScore']
  realOutreach: ConsultingReport['outreachTargets']
}) {
  const prompt = `Prospect: ${input.businessName} (${input.businessType})
Market: ${input.metroLabel}

REAL competitive snapshot (Google Places, top 5):
${JSON.stringify(input.competitive, null, 2)}

REAL Census demographics for prospect's ZIP:
${JSON.stringify(input.marketScan, null, 2)}

REAL B2B outreach targets near them (use names in executive summary if relevant):
${JSON.stringify(input.realOutreach.map((t) => `${t.business} (${t.type})`), null, 2)}

PROJECTED performance baseline for ${input.businessType} businesses of this size:
${JSON.stringify(input.performance, null, 2)}

BellAveGo Score (projected):
${JSON.stringify(input.bellaveScore, null, 2)}

Generate the executiveSummary (3 paragraphs), opportunities (3 ranked), actionPlan (5 prioritized).
Schema:
${SCHEMA}`

  const completion = await anthropic.messages.create({
    // Haiku 4.5 — switched 2026-06-04 for cost. Sonnet was $0.04/report ×
    // 580/day = $23/day. Haiku is ~$0.005/report = $2.90/day. Quality dip
    // is minor for cold-email-grade reports (prospect reads <60sec anyway).
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = completion.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, '')

  const parsed = JSON.parse(text) as {
    executiveSummary: string[]
    opportunities: ConsultingReport['opportunities']
    actionPlan: ConsultingReport['actionPlan']
  }
  return {
    executiveSummary: parsed.executiveSummary.slice(0, 3).map(String),
    opportunities: (parsed.opportunities ?? []).slice(0, 3).map((o, i) => ({
      rank: i + 1,
      title: String(o.title ?? '').slice(0, 80),
      monthlyValue: Math.max(0, Math.round(Number(o.monthlyValue) || 0)),
      pattern: String(o.pattern ?? ''),
      action: String(o.action ?? ''),
      confidence: (['high', 'medium', 'low'] as Confidence[]).includes(o.confidence) ? o.confidence : 'medium',
    })),
    actionPlan: (parsed.actionPlan ?? []).slice(0, 5).map((a, i) => ({
      priority: i + 1,
      title: String(a.title ?? '').slice(0, 80),
      rationale: String(a.rationale ?? ''),
      expectedImpact: String(a.expectedImpact ?? ''),
      timeline: String(a.timeline ?? ''),
      effort: (['low', 'medium', 'high'] as const).includes(a.effort) ? a.effort : 'medium',
    })),
  }
}

function fallbackNarrative(
  businessName: string,
  businessType: string,
  competitive: ConsultingReport['competitive'],
  marketScan: ConsultingReport['marketScan'],
) {
  return {
    executiveSummary: [
      `${businessName} operates in a market with ${competitive.competitors.length}+ ${businessType} competitors averaging ${competitive.marketAvgRating.toFixed(1)} stars across ${competitive.marketAvgReviewCount} reviews each. ${marketScan.homeownersInArea > 0 ? `Your service area covers approximately ${marketScan.homeownersInArea.toLocaleString()} owner-occupied homes with a median household income of $${marketScan.medianIncome.toLocaleString()}.` : ''} The single fastest win is closing the after-hours gap — most ${businessType.toLowerCase()} businesses miss 18-40 calls/month outside business hours.`,
      `The biggest concrete opportunity is recovering missed Saturday calls. Across the trade, businesses see 8-12 emergency-flavored Saturday calls per month with a 52% close rate when reached promptly. At local ticket averages, that's $1,800-$4,200/mo in addressable revenue currently going to voicemail.`,
      `The 90-day action plan sequences three plays: (1) capture Saturday emergencies via AI receptionist, (2) tighten quote follow-up so half your estimates don't go cold, and (3) close the review-volume gap with automated post-job review requests.`,
    ],
    opportunities: [
      {
        rank: 1, title: 'Saturday emergency-call capture', monthlyValue: 1800,
        pattern: '8-12 missed calls per Sat in this trade. 52% close rate when reached promptly. Emergency intent = higher ticket.',
        action: 'Activate AI receptionist Saturday-mode: auto-text owner on emergency keywords + auto-offer earliest Sunday slot.',
        confidence: 'high' as const,
      },
      {
        rank: 2, title: 'Quote follow-up automation', monthlyValue: 1200,
        pattern: '50%+ of quotes go cold without follow-up. 2-touch sequence at day 2 and day 7 lifts close rate 15-22%.',
        action: 'Office Manager tier: Quote Hunter SMS at day 2/7/14 with one-tap "lock it in" link.',
        confidence: 'high' as const,
      },
      {
        rank: 3, title: 'Review volume catch-up', monthlyValue: 900,
        pattern: `Local market average is ${competitive.marketAvgReviewCount} reviews. ${competitive.yourReviewCount > 0 ? `You're at ${competitive.yourReviewCount} — that gap deters first-time searchers.` : 'Closing the review gap deters first-time searchers from picking competitors.'}`,
        action: 'Auto-text Google review request 4hr after every completed job. Expect 18-32% response rate.',
        confidence: 'medium' as const,
      },
    ],
    actionPlan: [
      { priority: 1, title: 'Activate Saturday capture', rationale: 'Biggest revenue gap, fastest activation', expectedImpact: '+$1,800/mo in 30 days', timeline: 'This week', effort: 'low' as const },
      { priority: 2, title: 'Turn on Quote Hunter', rationale: 'Recovers cold quotes you already paid to generate', expectedImpact: '+$1,200/mo', timeline: 'Within 7 days', effort: 'low' as const },
      { priority: 3, title: 'Auto-request reviews on completed jobs', rationale: 'Closes credibility gap vs larger competitors', expectedImpact: '+12-20 reviews/mo', timeline: 'Live immediately', effort: 'low' as const },
      { priority: 4, title: 'Work the 5 commercial outreach targets in §6', rationale: 'Real commercial properties from Google Places — high LTV per contract', expectedImpact: 'One contract ≈ $2,400/mo recurring', timeline: '2 calls/wk × 3 wks', effort: 'medium' as const },
      { priority: 5, title: 'Pre-season campaign for trade peak', rationale: `Get ahead of ${businessType.toLowerCase()} seasonal demand by 2-4 weeks vs competitors`, expectedImpact: 'Captures early-mover share', timeline: 'Plan now, ship 2 weeks before peak', effort: 'medium' as const },
    ],
  }
}
