import { createClient } from '@supabase/supabase-js'
import type { ConsultingReport } from './consultingReport'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type ProfileSlim = {
  user_id: string
  business_name?: string | null
  owner_first_name?: string | null
  service_area?: string | null
  zip_code?: string | null
  google_place_id?: string | null
  business_type?: string | null
  plan_tier?: string | null
}

// ────────────────────────────────────────────────────────────────
// INTERNAL METRICS — call_logs + jobs over a window, with prior-period delta
// ────────────────────────────────────────────────────────────────

export type InternalMetricsWindow = {
  callsReceived: number
  callsAnswered: number
  jobsBooked: number
  jobsCompleted: number
  totalRevenue: number
  avgJobValue: number
  callsSavedAfterHours: number
  peakUnansweredHour: string
  peakUnansweredCount: number
  topJobType: string
  jobsByType: Array<{ type: string; count: number; revenue: number }>
  // Rate fields (precomputed so the score formulas don't recompute)
  answerRate: number
  bookingConversion: number
  // Revenue breakdown — feeds the report's "real vs estimated" disclosure
  revenueReported: number      // sum of jobs.amount where revenue_source='reported'
  revenueEstimated: number     // sum of jobs.amount_estimated where amount IS NULL
  jobsWithReportedRevenue: number
  jobsWithEstimatedRevenue: number
}

export type InternalMetricsWithDelta = {
  current: InternalMetricsWindow
  prior: InternalMetricsWindow
  delta: {
    callsReceived: number
    callsAnswered: number
    jobsBooked: number
    jobsCompleted: number
    totalRevenue: number
    avgJobValue: number
  }
}

/**
 * Pull internal performance metrics for a contractor over a window AND the
 * prior window of the same length so we can compute deltas. Returns zeros
 * for brand-new customers instead of crashing.
 */
export async function pullInternalMetricsWithDelta(
  userId: string,
  days: number,
): Promise<InternalMetricsWithDelta> {
  const now = Date.now()
  const ms = days * 24 * 60 * 60 * 1000
  const currentStart = new Date(now - ms).toISOString()
  const priorStart = new Date(now - 2 * ms).toISOString()
  const priorEnd = currentStart

  const current = await pullInternalMetrics(userId, currentStart)
  const prior = await pullInternalMetrics(userId, priorStart, priorEnd)

  return {
    current,
    prior,
    delta: {
      callsReceived: pctDelta(current.callsReceived, prior.callsReceived),
      callsAnswered: pctDelta(current.callsAnswered, prior.callsAnswered),
      jobsBooked: pctDelta(current.jobsBooked, prior.jobsBooked),
      jobsCompleted: pctDelta(current.jobsCompleted, prior.jobsCompleted),
      totalRevenue: pctDelta(current.totalRevenue, prior.totalRevenue),
      avgJobValue: pctDelta(current.avgJobValue, prior.avgJobValue),
    },
  }
}

async function pullInternalMetrics(
  userId: string,
  sinceIso: string,
  untilIso?: string,
): Promise<InternalMetricsWindow> {
  // calls
  let callsQuery = supabase
    .from('call_logs')
    .select('id, booking_completed, created_at, job_type')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
  if (untilIso) callsQuery = callsQuery.lt('created_at', untilIso)
  const { data: calls } = await callsQuery

  const callsReceived = calls?.length ?? 0
  const callsAnswered = calls?.filter((c) => c.booking_completed).length ?? 0

  // jobs — pull amount_estimated + revenue_source for the real-vs-estimated split
  let jobsQuery = supabase
    .from('jobs')
    .select('id, status, amount, amount_estimated, revenue_source, job_type, created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
  if (untilIso) jobsQuery = jobsQuery.lt('created_at', untilIso)
  const { data: jobs } = await jobsQuery

  const jobsBooked = jobs?.length ?? 0
  // Revenue counts ALL bookable jobs (not just status='completed') because
  // the AI books jobs as 'pending_approval' / 'scheduled' and the contractor
  // often doesn't mark them 'completed' in our dashboard. We exclude only
  // explicit cancellations + declines so reports reflect actual booked work.
  const revenueJobs = (jobs ?? []).filter((j) => !['cancelled', 'declined'].includes(j.status as string))
  const jobsCompleted = revenueJobs.filter((j) => j.status === 'completed').length

  // Real vs estimated split — drives the report disclosure footer.
  let revenueReported = 0
  let revenueEstimated = 0
  let jobsWithReportedRevenue = 0
  let jobsWithEstimatedRevenue = 0
  for (const j of revenueJobs) {
    const real = Number(j.amount) || 0
    if (real > 0) {
      revenueReported += real
      jobsWithReportedRevenue++
    } else {
      const est = Number(j.amount_estimated) || 0
      if (est > 0) {
        revenueEstimated += est
        jobsWithEstimatedRevenue++
      }
    }
  }
  const totalRevenue = revenueReported + revenueEstimated
  const revenueJobCount = jobsWithReportedRevenue + jobsWithEstimatedRevenue
  const avgJobValue = revenueJobCount > 0 ? Math.round(totalRevenue / revenueJobCount) : 0

  // After-hours saves: calls received outside 8AM-6PM weekdays
  const callsSavedAfterHours = computeAfterHoursCount(calls ?? [])

  // Peak unanswered hour
  const peak = computePeakHourDetail(calls ?? [])

  // Job type breakdown
  const typeMap = new Map<string, { count: number; revenue: number }>()
  for (const j of jobs ?? []) {
    const t = (j.job_type as string) || 'other'
    const cur = typeMap.get(t) || { count: 0, revenue: 0 }
    cur.count += 1
    if (j.status === 'completed') cur.revenue += Number(j.amount) || 0
    typeMap.set(t, cur)
  }
  const jobsByType = [...typeMap.entries()]
    .map(([type, v]) => ({ type, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.count - a.count)

  const topJobType = jobsByType[0]?.type
    || (calls?.find((c) => c.job_type)?.job_type as string | undefined)
    || 'service calls'

  return {
    callsReceived,
    callsAnswered,
    jobsBooked,
    jobsCompleted,
    totalRevenue,
    avgJobValue,
    callsSavedAfterHours,
    peakUnansweredHour: peak.label,
    peakUnansweredCount: peak.count,
    topJobType,
    jobsByType,
    answerRate: callsReceived > 0 ? callsAnswered / callsReceived : 0,
    bookingConversion: callsAnswered > 0 ? jobsBooked / callsAnswered : 0,
    revenueReported,
    revenueEstimated,
    jobsWithReportedRevenue,
    jobsWithEstimatedRevenue,
  }
}

function pctDelta(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 1 : 0
  return (current - prior) / prior
}

function computeAfterHoursCount(rows: { created_at?: string | null }[]): number {
  let n = 0
  for (const r of rows) {
    if (!r.created_at) continue
    const d = new Date(r.created_at)
    const dow = d.getDay() // 0=Sun, 6=Sat
    const hr = d.getHours()
    const weekend = dow === 0 || dow === 6
    const offHours = hr < 8 || hr >= 18
    if (weekend || offHours) n++
  }
  return n
}

function computePeakHourDetail(rows: { created_at?: string | null; booking_completed?: boolean | null }[]): { label: string; count: number } {
  const buckets = new Map<string, number>()
  for (const r of rows) {
    if (r.booking_completed) continue
    if (!r.created_at) continue
    const d = new Date(r.created_at)
    const dow = d.getDay()
    const block = Math.floor(d.getHours() / 2) * 2
    const key = `${dow}|${block}`
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  if (buckets.size === 0) return { label: '—', count: 0 }
  let best = ''
  let max = -1
  for (const [k, v] of buckets) {
    if (v > max) { max = v; best = k }
  }
  const [dowS, blockS] = best.split('|')
  const dow = Number(dowS)
  const block = Number(blockS)
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow]
  const startHr = ((block + 11) % 12) + 1
  const endHr = (((block + 2) + 11) % 12) + 1
  const ampm = block + 2 <= 12 ? 'AM' : 'PM'
  return { label: `${dayName} ${startHr}–${endHr} ${ampm}`, count: max }
}

// ────────────────────────────────────────────────────────────────
// MARKET CONTEXT — Google Places (competitors, ratings, distance, map pins)
// ────────────────────────────────────────────────────────────────

export type MarketContext = {
  // Customer's own Google Business Profile data
  yourRating?: number
  yourReviewCount?: number
  yourPlaceName?: string

  // Competitor data
  competitorCount: number
  avgCompetitorRating: number
  marketAvgReviewCount: number
  topCompetitors: Array<{
    name: string
    rating: number
    reviewCount: number
    distanceMi: number
  }>
  yourRank: number               // 1 = highest rated in area
  totalCompetitorsRanked: number // n where rank is "1 of n"
  percentileLabel: string        // e.g. "Top 30%"

  // Map data
  mapCenter?: { lat: number; lng: number }
  mapPoints: Array<{
    lat: number
    lng: number
    kind: 'business' | 'competitor' | 'opportunity'
    label: string
    name?: string
    rating?: number
    distanceMi?: number
  }>
}

type GooglePlace = {
  name?: string
  place_id?: string
  rating?: number
  user_ratings_total?: number
  geometry?: { location?: { lat?: number; lng?: number } }
  formatted_address?: string
}

export async function pullMarketContext(profile: ProfileSlim): Promise<MarketContext> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey || !profile.business_type) {
    return emptyMarket()
  }
  const trade = profile.business_type
  const area = profile.zip_code || profile.service_area || ''
  if (!area) return emptyMarket()

  // 1. Find competitors near the area
  let results: GooglePlace[] = []
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${encodeURIComponent(`${trade} near ${area}`)}` +
      `&key=${apiKey}`
    const res = await fetch(url, { next: { revalidate: 60 * 60 } })
    const data = (await res.json()) as { results?: GooglePlace[] }
    results = (data.results ?? []).filter((r) => r.place_id !== profile.google_place_id)
  } catch (e) {
    console.warn('places lookup failed:', e)
    return emptyMarket()
  }

  // 2. Pull customer's own place details (rating, review count, geometry)
  let yourRating: number | undefined
  let yourReviewCount: number | undefined
  let yourPlaceName: string | undefined
  let mapCenter: { lat: number; lng: number } | undefined

  if (profile.google_place_id) {
    try {
      const detailsUrl =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${encodeURIComponent(profile.google_place_id)}` +
        `&fields=name,geometry,rating,user_ratings_total` +
        `&key=${apiKey}`
      const detRes = await fetch(detailsUrl, { next: { revalidate: 60 * 60 } })
      const detData = (await detRes.json()) as {
        result?: {
          name?: string
          geometry?: { location?: { lat?: number; lng?: number } }
          rating?: number
          user_ratings_total?: number
        }
      }
      yourRating = detData.result?.rating
      yourReviewCount = detData.result?.user_ratings_total
      yourPlaceName = detData.result?.name
      const loc = detData.result?.geometry?.location
      if (loc?.lat != null && loc?.lng != null) {
        mapCenter = { lat: loc.lat, lng: loc.lng }
      }
    } catch (e) {
      console.warn('place details lookup failed:', e)
    }
  }

  // 3. Rank: where does the customer fall in the competitor rating distribution?
  const ratedCompetitors = results.filter((r) => typeof r.rating === 'number') as Array<GooglePlace & { rating: number }>
  const competitorCount = ratedCompetitors.length
  const avgCompetitorRating = competitorCount > 0
    ? ratedCompetitors.reduce((s, r) => s + r.rating, 0) / competitorCount
    : 4.2
  const marketAvgReviewCount = competitorCount > 0
    ? Math.round(ratedCompetitors.reduce((s, r) => s + (r.user_ratings_total ?? 0), 0) / competitorCount)
    : 0

  let yourRank = 0
  let totalRanked = competitorCount + 1
  let percentileLabel = ''
  if (yourRating != null) {
    const ratingsWithMine = [...ratedCompetitors.map((c) => c.rating), yourRating]
      .sort((a, b) => b - a)
    yourRank = ratingsWithMine.indexOf(yourRating) + 1
    const pct = yourRank / ratingsWithMine.length
    percentileLabel =
      pct <= 0.10 ? 'Top 10%' :
      pct <= 0.30 ? 'Top 30%' :
      pct <= 0.50 ? 'Top 50%' :
      'Bottom 50%'
  }

  // 4. Top 5 competitors with distance (haversine from customer's map center)
  const topCompetitorsAll = [...ratedCompetitors]
    .sort((a, b) => (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0))
    .slice(0, 5)

  const topCompetitors = topCompetitorsAll.map((c) => {
    const loc = c.geometry?.location
    const distanceMi = (mapCenter && loc?.lat != null && loc?.lng != null)
      ? haversineMiles(mapCenter, { lat: loc.lat, lng: loc.lng })
      : 0
    return {
      name: c.name ?? 'Unknown',
      rating: c.rating,
      reviewCount: c.user_ratings_total ?? 0,
      distanceMi,
    }
  })

  // 5. Build map points
  const mapPoints: MarketContext['mapPoints'] = []
  if (mapCenter) {
    mapPoints.push({
      lat: mapCenter.lat,
      lng: mapCenter.lng,
      kind: 'business',
      label: 'Y',
      name: yourPlaceName,
      rating: yourRating,
    })
  }
  topCompetitorsAll.forEach((c, i) => {
    const loc = c.geometry?.location
    if (loc?.lat == null || loc?.lng == null) return
    if (!mapCenter) mapCenter = { lat: loc.lat, lng: loc.lng }
    mapPoints.push({
      lat: loc.lat,
      lng: loc.lng,
      kind: 'competitor',
      label: String(i + 1),
      name: c.name,
      rating: c.rating,
      distanceMi: mapCenter ? haversineMiles(mapCenter, { lat: loc.lat, lng: loc.lng }) : 0,
    })
  })

  return {
    yourRating,
    yourReviewCount,
    yourPlaceName,
    competitorCount,
    avgCompetitorRating,
    marketAvgReviewCount,
    topCompetitors,
    yourRank,
    totalCompetitorsRanked: totalRanked,
    percentileLabel,
    mapCenter,
    mapPoints,
  }
}

function emptyMarket(): MarketContext {
  return {
    competitorCount: 0,
    avgCompetitorRating: 4.2,
    marketAvgReviewCount: 0,
    topCompetitors: [],
    yourRank: 0,
    totalCompetitorsRanked: 0,
    percentileLabel: '',
    mapPoints: [],
  }
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8 // Earth radius in miles
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 10) / 10
}

// ────────────────────────────────────────────────────────────────
// CENSUS ACS — homeowner count, median income, median home age (FREE public API)
// ────────────────────────────────────────────────────────────────

export type CensusContext = {
  homeownersInArea: number       // owner-occupied housing units (DP04_0046E)
  medianIncome: number           // median household income (B19013_001E)
  medianHomeAge: number          // years since median year built
  totalHousingUnits: number
}

/**
 * Pull demographic context from US Census ACS 5-year (free, no API key needed
 * for low-volume use — works without CENSUS_API_KEY but rate-limited).
 *
 * We resolve a ZIP code to a ZCTA, then pull the standard demographic vars.
 */
export async function pullCensusContext(zipCode: string | null | undefined): Promise<CensusContext | null> {
  if (!zipCode) return null
  const zip = String(zipCode).replace(/\D/g, '').slice(0, 5)
  if (zip.length !== 5) return null

  const apiKey = process.env.CENSUS_API_KEY
  const keyParam = apiKey ? `&key=${apiKey}` : ''
  // ACS 2022 (latest as of 2026). Variables:
  //   DP04_0046E = Owner-occupied housing units (estimate)
  //   DP04_0001E = Total housing units
  //   B19013_001E = Median household income
  //   B25035_001E = Median year structure built
  const vars = 'DP04_0046E,DP04_0001E,B19013_001E,B25035_001E,NAME'
  const url = `https://api.census.gov/data/2022/acs/acs5/profile?get=${vars}&for=zip%20code%20tabulation%20area:${zip}${keyParam}`

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 7 } }) // 7-day cache
    if (!res.ok) {
      // ACS profile dataset may not have B19013/B25035 — fall back to direct ACS5
      return pullCensusContextFallback(zip, apiKey)
    }
    const data = await res.json() as string[][]
    // Header row + one data row expected
    if (!Array.isArray(data) || data.length < 2) return null
    const header = data[0]
    const row = data[1]
    const idx = (k: string) => header.indexOf(k)
    const owners = Number(row[idx('DP04_0046E')]) || 0
    const total = Number(row[idx('DP04_0001E')]) || 0
    const income = Number(row[idx('B19013_001E')]) || 0
    const medianYear = Number(row[idx('B25035_001E')]) || 0
    const currentYear = new Date().getFullYear()
    return {
      homeownersInArea: owners,
      medianIncome: income,
      medianHomeAge: medianYear > 1800 ? currentYear - medianYear : 0,
      totalHousingUnits: total,
    }
  } catch (e) {
    console.warn('census ACS profile fetch failed:', e)
    return pullCensusContextFallback(zip, apiKey)
  }
}

async function pullCensusContextFallback(zip: string, apiKey?: string): Promise<CensusContext | null> {
  // Some variables live only on the base ACS5 dataset, not the profile dataset.
  const keyParam = apiKey ? `&key=${apiKey}` : ''
  try {
    const url = `https://api.census.gov/data/2022/acs/acs5?get=B25003_002E,B25001_001E,B19013_001E,B25035_001E&for=zip%20code%20tabulation%20area:${zip}${keyParam}`
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 7 } })
    if (!res.ok) return null
    const data = await res.json() as string[][]
    if (!Array.isArray(data) || data.length < 2) return null
    const header = data[0]
    const row = data[1]
    const idx = (k: string) => header.indexOf(k)
    // B25003_002E = Owner-occupied housing units
    // B25001_001E = Total housing units
    // B19013_001E = Median household income
    // B25035_001E = Median year structure built
    const owners = Number(row[idx('B25003_002E')]) || 0
    const total = Number(row[idx('B25001_001E')]) || 0
    const income = Number(row[idx('B19013_001E')]) || 0
    const medianYear = Number(row[idx('B25035_001E')]) || 0
    const currentYear = new Date().getFullYear()
    return {
      homeownersInArea: owners,
      medianIncome: income,
      medianHomeAge: medianYear > 1800 ? currentYear - medianYear : 0,
      totalHousingUnits: total,
    }
  } catch (e) {
    console.warn('census ACS5 fallback failed:', e)
    return null
  }
}

// ────────────────────────────────────────────────────────────────
// B2B OUTREACH TARGETS — real commercial businesses in service area
// ────────────────────────────────────────────────────────────────

export type OutreachTarget = {
  business: string
  type: string
  address: string
  phone: string
  why: string
}

/**
 * Find 5 commercial outreach targets near the customer's service area via
 * Google Places. TCPA-safe: commercial properties only (no residential).
 *
 * We tailor the query mix to the contractor's trade — e.g. HVAC contractors
 * get property managers + restaurants + retail centers, plumbers get the
 * same plus medical/dental offices, electricians get the same plus offices.
 */
export async function findB2BOutreachTargets(profile: ProfileSlim): Promise<OutreachTarget[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return []
  const area = profile.zip_code || profile.service_area
  if (!area) return []

  const trade = (profile.business_type || '').toLowerCase()

  // Commercial categories that consistently need home-service-style vendors,
  // sorted by typical contract value (highest first).
  const categories: Array<{ query: string; type: string; why: (name: string) => string }> = [
    {
      query: 'property management company',
      type: 'Multi-family property mgmt',
      why: () =>
        `Manages multi-unit residential buildings in your area — recurring vendor relationships, ${trade ? trade + ' ' : ''}service contracts standard.`,
    },
    {
      query: 'apartment complex',
      type: 'Multi-family (200+ units)',
      why: () =>
        `Large multi-family operator. Preventive maintenance contracts are standard — high recurring revenue potential.`,
    },
    {
      query: 'restaurant',
      type: 'Restaurant',
      why: () =>
        `Restaurants run kitchen equipment + HVAC at high intensity. 24/7 service expectations = premium-rate work.`,
    },
    {
      query: 'shopping center',
      type: 'Retail / commercial',
      why: () =>
        `Multi-tenant retail with rooftop units. Common bid-out vendor at lease renewals — call quarterly.`,
    },
    {
      query: 'real estate brokerage',
      type: 'Real estate brokerage (referrals)',
      why: () =>
        `Agents need pre-listing inspections + post-close service. High-LTV referral pipeline if you become preferred vendor.`,
    },
  ]

  const targets: OutreachTarget[] = []
  for (const cat of categories) {
    if (targets.length >= 5) break
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/textsearch/json` +
        `?query=${encodeURIComponent(`${cat.query} near ${area}`)}` +
        `&key=${apiKey}`
      const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } })
      if (!res.ok) continue
      const data = (await res.json()) as { results?: Array<{ name?: string; formatted_address?: string; place_id?: string; rating?: number; user_ratings_total?: number }> }
      const top = (data.results ?? [])
        .filter((p) => p.name && p.formatted_address)
        .sort((a, b) => (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0))[0]
      if (!top || !top.place_id) continue

      // Fetch phone number from Place Details
      let phone = 'See Google'
      try {
        const detUrl =
          `https://maps.googleapis.com/maps/api/place/details/json` +
          `?place_id=${encodeURIComponent(top.place_id)}` +
          `&fields=formatted_phone_number,name,formatted_address` +
          `&key=${apiKey}`
        const detRes = await fetch(detUrl, { next: { revalidate: 60 * 60 * 24 } })
        const detData = (await detRes.json()) as { result?: { formatted_phone_number?: string } }
        if (detData.result?.formatted_phone_number) phone = detData.result.formatted_phone_number
      } catch { /* phone optional */ }

      targets.push({
        business: top.name!,
        type: cat.type,
        address: (top.formatted_address || '').split(',').slice(0, 2).join(',').trim(),
        phone,
        why: cat.why(top.name!),
      })
    } catch (e) {
      console.warn(`B2B search for "${cat.query}" failed:`, e)
    }
  }
  return targets
}

// ────────────────────────────────────────────────────────────────
// BELLAVEGO SCORE — composite + breakdown, now market-relative
// ────────────────────────────────────────────────────────────────

export type BellaveScore = ConsultingReport['bellaveScore']

/**
 * Compute the BellAveGo Score (0-10 composite) from real metrics + market context.
 *
 * Weights (sum to 1.0):
 *   answer rate         0.25
 *   booking conversion  0.30
 *   response time       0.15   (constant 8.0 baseline until we measure call latency)
 *   pricing power       0.30   (avg ticket vs trade median; defaults to soft anchor if no market data)
 */
export function computeBellaveGoScore(
  metrics: InternalMetricsWindow,
  market: MarketContext,
): BellaveScore {
  const answerRateScore = metrics.answerRate * 10
  const bookingConvScore = metrics.bookingConversion * 10

  // Response time: AI receptionist answers in <2s, so baseline 8.0 (vs. human
  // baseline ~6 with delays / voicemail). Tunable once we capture real latency.
  const responseTimeScore = 8.0

  // Pricing power: avg ticket relative to a soft $500 trade benchmark. When
  // we have enough customers per trade, this becomes a true market median.
  const pricingPowerScore = Math.min(10, Math.max(0, (metrics.avgJobValue / 500) * 6 + 2))

  const composite =
    answerRateScore * 0.25 +
    bookingConvScore * 0.30 +
    responseTimeScore * 0.15 +
    pricingPowerScore * 0.30

  return {
    composite: Math.round(composite * 10) / 10,
    answerRate: round1(answerRateScore),
    bookingConversion: round1(bookingConvScore),
    responseTime: responseTimeScore,
    pricingPower: round1(pricingPowerScore),
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }

// ────────────────────────────────────────────────────────────────
// TRADE TICKET ESTIMATES — shared default $ amount per job by trade
// Used by:
//   - Job creation (pre-fill jobs.amount_estimated)
//   - Revenue-followup cron fallback
//   - Personalize endpoint (projected performance)
// Single source of truth so changing one trade updates the whole system.
// ────────────────────────────────────────────────────────────────

const TRADE_TICKET_ESTIMATES: Array<[RegExp, number]> = [
  [/hvac|heating|cooling|furnace|air\s*condition/i, 620],
  [/plumb|water\s*heater|drain|sewer/i, 380],
  [/electric(al)?/i, 450],
  [/roof/i, 1850],
  [/landscap|lawn/i, 240],
  [/clean/i, 175],
  [/pest|exterminat/i, 195],
  [/handyman/i, 280],
  [/appliance/i, 290],
  [/garage\s*door/i, 425],
  [/paint/i, 850],
  [/window|glazi/i, 540],
  [/concrete|mason/i, 1200],
  [/tree|arbor/i, 480],
  [/snow/i, 180],
  [/locksmith/i, 165],
]

const DEFAULT_TICKET = 380

/**
 * Best-guess average ticket for a trade. Used to pre-fill jobs.amount_estimated
 * at job creation time. The match runs against `business_type` (e.g. "HVAC")
 * OR `job_type` (e.g. "AC repair") OR the AI's captured reason ("furnace not heating").
 * Falls back to $380 for unknown trades.
 */
export function estimateJobTicket(...candidates: Array<string | null | undefined>): number {
  const text = candidates.filter(Boolean).join(' ').toLowerCase()
  if (!text) return DEFAULT_TICKET
  for (const [re, val] of TRADE_TICKET_ESTIMATES) {
    if (re.test(text)) return val
  }
  return DEFAULT_TICKET
}
