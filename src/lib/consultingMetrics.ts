import { createClient } from '@supabase/supabase-js'
import type { ReportInput } from './generateReport'

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

/**
 * Pull internal performance metrics for a contractor over the last `days` window.
 * Reads call_logs and jobs. Resilient to missing data — returns zeros instead of
 * crashing, since brand-new customers will have no history.
 */
export async function pullInternalMetrics(
  userId: string,
  days: number,
): Promise<ReportInput['metrics']> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // calls
  const { data: calls } = await supabase
    .from('call_logs')
    .select('id, booking_completed, created_at, job_type')
    .eq('user_id', userId)
    .gte('created_at', since)

  const callsReceived = calls?.length ?? 0
  const callsAnswered = calls?.filter((c) => c.booking_completed).length ?? 0

  // jobs
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, status, amount, job_type, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)

  const jobsBooked = jobs?.length ?? 0
  const completedJobs = jobs?.filter((j) => j.status === 'completed') ?? []
  const jobsCompleted = completedJobs.length
  const totalRevenue = completedJobs.reduce((s, j) => s + (Number(j.amount) || 0), 0)
  const avgJobValue = jobsCompleted > 0 ? Math.round(totalRevenue / jobsCompleted) : 0

  // peak unanswered hour-of-week
  const peakUnansweredHour = computePeakHour(calls ?? [])

  // top job type (from booked jobs, fallback to call_log job_type)
  const allTypes = [
    ...(jobs?.map((j) => j.job_type) ?? []),
    ...(calls?.map((c) => c.job_type) ?? []),
  ].filter(Boolean) as string[]
  const topJobType = topString(allTypes) || 'service calls'

  return {
    callsReceived,
    callsAnswered,
    jobsBooked,
    jobsCompleted,
    totalRevenue,
    avgJobValue,
    peakUnansweredHour,
    topJobType,
  }
}

function computePeakHour(rows: { created_at?: string | null; booking_completed?: boolean | null }[]): string {
  // Bucket unanswered calls into (day-of-week, 2hr-block) buckets
  const buckets = new Map<string, number>()
  for (const r of rows) {
    if (r.booking_completed) continue
    if (!r.created_at) continue
    const d = new Date(r.created_at)
    const dow = d.getDay() // 0 = Sun
    const block = Math.floor(d.getHours() / 2) * 2
    const key = `${dow}|${block}`
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  if (buckets.size === 0) return '—'
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
  const endHr = ((block + 1 + 11) % 12) + 1
  const ampm = block + 2 <= 12 ? 'AM' : 'PM'
  return `${dayName} ${startHr}–${endHr} ${ampm}`
}

function topString(arr: string[]): string | null {
  if (arr.length === 0) return null
  const counts = new Map<string, number>()
  for (const s of arr) counts.set(s, (counts.get(s) ?? 0) + 1)
  let best: string | null = null
  let max = -1
  for (const [k, v] of counts) {
    if (v > max) { max = v; best = k }
  }
  return best
}

/**
 * Pull local-market context via Google Places. Optional — falls back to a
 * generic "no places data" object so report generation never blocks.
 *
 * NEW (May 2026): Also returns lat/lng for the customer's own business + up
 * to 5 competitors, plus a mapCenter, so the report PDF can render a real
 * Google Static Maps image with actual pinpoints instead of stylized SVG.
 */
export async function pullMarketContext(profile: ProfileSlim): Promise<ReportInput['market']> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey || !profile.business_type) {
    return fallbackMarket(profile)
  }
  const trade = profile.business_type
  const area = profile.zip_code || profile.service_area || ''
  if (!area) return fallbackMarket(profile)

  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${encodeURIComponent(`${trade} near ${area}`)}` +
      `&key=${apiKey}`
    const res = await fetch(url, { next: { revalidate: 0 } })
    const data = (await res.json()) as {
      results?: {
        name: string
        rating?: number
        user_ratings_total?: number
        place_id?: string
        geometry?: { location?: { lat?: number; lng?: number } }
      }[]
    }
    const results = (data.results ?? []).filter((r) => r.place_id !== profile.google_place_id)
    const competitorCount = results.length
    const ratings = results.map((r) => r.rating).filter((n): n is number => typeof n === 'number')
    const avgCompetitorRating = ratings.length
      ? ratings.reduce((s, n) => s + n, 0) / ratings.length
      : 4.2
    const topCompetitors = results.slice(0, 3).map((r) => ({
      name: r.name,
      rating: r.rating ?? 0,
      reviewCount: r.user_ratings_total ?? 0,
    }))
    const customerRank = Math.max(1, Math.floor(competitorCount / 2))

    // ── Real geographic pins for the PDF map ───────────────────────
    // 1. Customer's own business — fetch from Google Place Details if they
    //    have a google_place_id on file, otherwise skip (no marker).
    let mapCenter: { lat: number; lng: number } | undefined
    const mapPoints: NonNullable<ReportInput['market']['mapPoints']> = []

    if (profile.google_place_id) {
      try {
        const detailsUrl =
          `https://maps.googleapis.com/maps/api/place/details/json` +
          `?place_id=${encodeURIComponent(profile.google_place_id)}` +
          `&fields=name,geometry` +
          `&key=${apiKey}`
        const detRes = await fetch(detailsUrl, { next: { revalidate: 0 } })
        const detData = (await detRes.json()) as {
          result?: { name?: string; geometry?: { location?: { lat?: number; lng?: number } } }
        }
        const loc = detData.result?.geometry?.location
        if (loc?.lat != null && loc?.lng != null) {
          mapCenter = { lat: loc.lat, lng: loc.lng }
          mapPoints.push({
            lat: loc.lat,
            lng: loc.lng,
            kind: 'business',
            label: 'Y', // "You"
          })
        }
      } catch (e) {
        console.warn('place details lookup failed:', e)
      }
    }

    // 2. Top 5 competitors by review count — plot with numeric labels
    const competitorsByReviews = [...results].sort(
      (a, b) => (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0),
    )
    let pinIdx = 1
    for (const comp of competitorsByReviews) {
      if (pinIdx > 5) break
      const loc = comp.geometry?.location
      if (loc?.lat == null || loc?.lng == null) continue
      mapPoints.push({
        lat: loc.lat,
        lng: loc.lng,
        kind: 'competitor',
        label: String(pinIdx),
      })
      // If we still don't have a center (customer has no google_place_id),
      // anchor the map on the first competitor we plot.
      if (!mapCenter) mapCenter = { lat: loc.lat, lng: loc.lng }
      pinIdx++
    }

    return {
      competitorCount,
      avgCompetitorRating,
      topCompetitors,
      customerRank,
      mapCenter,
      mapPoints: mapPoints.length > 0 ? mapPoints : undefined,
    }
  } catch (e) {
    console.warn('places lookup failed:', e)
    return fallbackMarket(profile)
  }
}

function fallbackMarket(_p: ProfileSlim): ReportInput['market'] {
  return {
    competitorCount: 0,
    avgCompetitorRating: 4.2,
    topCompetitors: [],
    customerRank: 0,
  }
}

/**
 * Compute the BellAveGo Score (0–10 composite) from metrics. Mirrors the formula
 * documented in agents/consulting-report.md so reports across cohorts are comparable.
 */
export function computeBellaveGoScore(metrics: ReportInput['metrics']): ReportInput['bellaveGoScore'] {
  const answerRate = metrics.callsReceived > 0 ? metrics.callsAnswered / metrics.callsReceived : 0
  const bookingConv = metrics.callsAnswered > 0 ? metrics.jobsBooked / metrics.callsAnswered : 0
  // Response time score — we don't measure latency yet, baseline 8/10 for AI receptionist
  const responseTime = 8.0
  // Pricing power — relative to a soft $500 benchmark; clamp 0–10
  const pricingPower = Math.min(10, Math.max(0, (metrics.avgJobValue / 500) * 6 + 2))

  const answerRateScore = answerRate * 10
  const bookingConvScore = bookingConv * 10

  const composite =
    answerRateScore * 0.25 +
    bookingConvScore * 0.3 +
    responseTime * 0.15 +
    pricingPower * 0.3

  return {
    composite: Math.round(composite * 10) / 10,
    breakdown: [
      { label: 'Answer rate', value: round1(answerRateScore), max: 10 },
      { label: 'Booking conversion', value: round1(bookingConvScore), max: 10 },
      { label: 'Response time', value: responseTime, max: 10 },
      { label: 'Avg job value vs market', value: round1(pricingPower), max: 10 },
    ],
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }
