/**
 * Weekly strategy report generator. The crown jewel of the Elite tier.
 *
 * Pulls 7 days of data across calls, jobs, campaigns, leads, competitors, GBP,
 * SEO posts, and weather events. Sends to Claude with a McKinsey-style system
 * prompt. Stores the structured payload + narrative in concierge_reports.
 *
 * The customer reads the report at /r/{reportId} — a public, beautifully formatted
 * web page with a short-link signed by report_id (UUIDs are unguessable enough
 * for MVP; we can sign with HMAC later if needed).
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()

const WEEKLY_PROMPT = `You are a McKinsey-style strategy consultant writing a weekly business review for a home-services SMB owner.

Tone: executive-brief. Confident, specific, numerical. No hedging. No fluff. Tactical horizon: 7 days.

Structure your response as STRICT JSON:
{
  "exec_summary": ["bullet 1", "bullet 2", "bullet 3"],
  "key_wins": ["specific win 1", ...],
  "what_to_fix": ["specific issue 1 with the metric", ...],
  "competitive_intel": ["insight about competitors with specifics", ...],
  "this_weeks_action": ["concrete action 1 with owner + deadline", "concrete action 2", "concrete action 3"]
}

Rules:
- Every bullet must include a SPECIFIC NUMBER from the data when possible
- Action items must be doable by Friday this week, single owner
- Skip a section (empty array) if no signal — never invent
- If the customer had a slow week, say so plainly. Don't manufacture wins.
- Output ONLY the JSON. No markdown, no commentary.`

const QUARTERLY_PROMPT = `You are a McKinsey Senior Partner writing a quarterly business review for a home-services SMB owner.
This is the quarterly deep-dive — the customer is an Elite-tier subscriber ($597/mo) and expects a real strategic artifact, not a weekly summary.

Tone: senior advisor. Strategic horizon: 90 days. Reference 90-day patterns, not single-week noise. Identify the 2-3 bets that will define the next quarter.

Structure your response as STRICT JSON:
{
  "exec_summary": ["3-5 bullets, each a major insight from the quarter, with a numeric anchor"],
  "quarter_in_review": ["what defined the past 90 days — wins, trends, surprises, with numbers"],
  "patterns_emerging": ["multi-week patterns: service-mix shifts, customer-acquisition channel shifts, pricing power changes, capacity ceilings"],
  "competitive_position": ["where the customer stands vs the 5 tracked competitors over 90 days — rating drift, review volume, sentiment themes"],
  "next_quarter_bets": ["2-3 strategic bets for the next 90 days. Each: WHAT, WHY (cite data), HOW (concrete first move within 14 days)"],
  "risks": ["concentration, capacity, pricing, or marketing risks that could blow up the next quarter"],
  "north_star_metric": "one number to obsess over for the next 90 days, with the current value and the target"
}

Rules:
- Reference 90-day windows, not weekly
- Cite SPECIFIC NUMBERS from the data — month-over-month comparisons preferred
- Bets must be ambitious but doable within 14 days for the first move
- Skip a section (empty array / empty string) if no signal — never invent
- This is the most expensive artifact the customer gets all year. Make it land.
- Output ONLY the JSON. No markdown, no commentary.`

export type ReportType = 'weekly_strategy' | 'quarterly_deep_dive'

function promptFor(reportType: ReportType): string {
  return reportType === 'quarterly_deep_dive' ? QUARTERLY_PROMPT : WEEKLY_PROMPT
}

function windowDaysFor(reportType: ReportType): number {
  return reportType === 'quarterly_deep_dive' ? 90 : 7
}

export type WeeklyData = {
  weekStart: string
  weekEnd: string
  calls: { received: number; booked: number; missed: number; bookingRate: number; byService: Record<string, number> }
  jobs: { created: number; completed: number; revenue: number }
  collections: { invoicesChased: number; recoveredCents: number }
  quotes: { sent: number; closed: number; closeRate: number }
  competitors: Array<{ name: string; rating: number; reviewCount: number; newReviewsWeek: number; themes: string[] }>
  weather: Array<{ event: string; severity: string; startedAt: string }>
  permits: { count: number; byType: Record<string, number> }
  leads: { sourced: number; contacted: number; booked: number }
  ads: { campaigns: number; spendCents: number; impressions: number; clicks: number; conversions: number }
  seo: Array<{ title: string; publishedAt: string; url?: string }>
  gbp: { rating: number; reviewCount: number; newReviewsWeek: number } | null
}

export type ReportNarrative = {
  exec_summary?: string[]
  // Weekly fields
  key_wins?: string[]
  what_to_fix?: string[]
  competitive_intel?: string[]
  this_weeks_action?: string[]
  // Quarterly fields
  quarter_in_review?: string[]
  patterns_emerging?: string[]
  competitive_position?: string[]
  next_quarter_bets?: string[]
  risks?: string[]
  north_star_metric?: string
}

export async function gatherWeeklyData(
  supabase: SupabaseClient,
  userId: string,
  weekStart: Date,
  windowDays: number = 7,
): Promise<WeeklyData> {
  const weekEnd = new Date(weekStart.getTime() + windowDays * 24 * 3600_000)
  const startIso = weekStart.toISOString()
  const endIso = weekEnd.toISOString()

  const [calls, jobs, invoices, quotes, competitors, weather, permits, leads, ads, seo, settings] = await Promise.all([
    supabase.from('call_logs').select('booking_completed, job_type').eq('user_id', userId).gte('created_at', startIso).lt('created_at', endIso),
    supabase.from('jobs').select('status, price, created_at').eq('user_id', userId).gte('created_at', startIso).lt('created_at', endIso),
    supabase.from('invoice_followups').select('chase_count, status, invoice_amount').eq('user_id', userId).gte('created_at', startIso).lt('created_at', endIso),
    supabase.from('quote_followups').select('status, quote_amount').eq('user_id', userId).gte('created_at', startIso).lt('created_at', endIso),
    supabase.from('competitor_intel').select('competitor_name, rating, review_count, new_reviews_today, recent_review_themes').eq('user_id', userId).gte('snapshot_date', weekStart.toISOString().split('T')[0]),
    supabase.from('weather_triggers').select('event_type, severity, starts_at').eq('user_id', userId).gte('created_at', startIso),
    supabase.from('permit_events').select('permit_type').eq('user_id', userId).gte('created_at', startIso),
    supabase.from('lead_lists').select('contacted_at, booked_job_id').eq('user_id', userId).gte('created_at', startIso),
    supabase.from('marketing_campaigns').select('status, spend_to_date_cents, impressions, clicks, conversions').eq('user_id', userId),
    supabase.from('seo_blog_posts').select('title, published_at, published_url, status').eq('user_id', userId).gte('created_at', startIso),
    supabase.from('concierge_settings').select('google_place_id').eq('user_id', userId).maybeSingle(),
  ])

  const callRows = (calls.data ?? []) as Array<{ booking_completed?: boolean; job_type?: string }>
  const received = callRows.length
  const booked = callRows.filter(c => c.booking_completed).length
  const byService: Record<string, number> = {}
  for (const c of callRows) {
    const k = (c.job_type ?? 'unknown').toLowerCase()
    byService[k] = (byService[k] ?? 0) + 1
  }

  const jobRows = (jobs.data ?? []) as Array<{ status?: string; price?: string | number }>
  const completedJobs = jobRows.filter(j => j.status === 'completed')
  const revenue = completedJobs.reduce((s, j) => s + (parseFloat(String(j.price ?? '0')) || 0), 0)

  const invRows = (invoices.data ?? []) as Array<{ status?: string; invoice_amount?: number }>
  const recovered = invRows.filter(i => i.status === 'paid').reduce((s, i) => s + (i.invoice_amount ?? 0) * 100, 0)

  const qRows = (quotes.data ?? []) as Array<{ status?: string }>
  const quotesClosed = qRows.filter(q => q.status === 'won').length

  const compRows = (competitors.data ?? []) as Array<{ competitor_name?: string; rating?: number; review_count?: number; new_reviews_today?: number; recent_review_themes?: string[] }>
  // Pick most recent snapshot per competitor
  const compMap = new Map<string, typeof compRows[number]>()
  for (const c of compRows) {
    if (c.competitor_name) compMap.set(c.competitor_name, c)
  }

  const permRows = (permits.data ?? []) as Array<{ permit_type?: string }>
  const permByType: Record<string, number> = {}
  for (const p of permRows) {
    const k = p.permit_type ?? 'other'
    permByType[k] = (permByType[k] ?? 0) + 1
  }

  const leadRows = (leads.data ?? []) as Array<{ contacted_at?: string; booked_job_id?: string }>

  const adRows = (ads.data ?? []) as Array<{ status?: string; spend_to_date_cents?: number; impressions?: number; clicks?: number; conversions?: number }>
  const adsActive = adRows.filter(a => a.status === 'active').length

  const seoRows = (seo.data ?? []) as Array<{ title?: string; published_at?: string; published_url?: string; status?: string }>

  return {
    weekStart: weekStart.toISOString().split('T')[0],
    weekEnd: weekEnd.toISOString().split('T')[0],
    calls: { received, booked, missed: received - booked, bookingRate: received ? booked / received : 0, byService },
    jobs: { created: jobRows.length, completed: completedJobs.length, revenue },
    collections: { invoicesChased: invRows.length, recoveredCents: recovered },
    quotes: { sent: qRows.length, closed: quotesClosed, closeRate: qRows.length ? quotesClosed / qRows.length : 0 },
    competitors: Array.from(compMap.values()).map(c => ({
      name: c.competitor_name ?? '',
      rating: c.rating ?? 0,
      reviewCount: c.review_count ?? 0,
      newReviewsWeek: c.new_reviews_today ?? 0,
      themes: c.recent_review_themes ?? [],
    })),
    weather: ((weather.data ?? []) as Array<{ event_type?: string; severity?: string; starts_at?: string }>).map(w => ({
      event: w.event_type ?? '',
      severity: w.severity ?? '',
      startedAt: w.starts_at ?? '',
    })),
    permits: { count: permRows.length, byType: permByType },
    leads: {
      sourced: leadRows.length,
      contacted: leadRows.filter(l => l.contacted_at).length,
      booked: leadRows.filter(l => l.booked_job_id).length,
    },
    ads: {
      campaigns: adsActive,
      spendCents: adRows.reduce((s, a) => s + (a.spend_to_date_cents ?? 0), 0),
      impressions: adRows.reduce((s, a) => s + (a.impressions ?? 0), 0),
      clicks: adRows.reduce((s, a) => s + (a.clicks ?? 0), 0),
      conversions: adRows.reduce((s, a) => s + (a.conversions ?? 0), 0),
    },
    seo: seoRows.filter(s => s.status === 'published').map(s => ({ title: s.title ?? '', publishedAt: s.published_at ?? '', url: s.published_url })),
    gbp: null,
  }
}

export async function generateNarrative(
  data: WeeklyData,
  businessName: string,
  reportType: ReportType = 'weekly_strategy',
): Promise<ReportNarrative> {
  const periodLabel = reportType === 'quarterly_deep_dive'
    ? `Quarter ending ${data.weekEnd} (90 days)`
    : `Week: ${data.weekStart} → ${data.weekEnd}`

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: reportType === 'quarterly_deep_dive' ? 3500 : 2000,
    system: promptFor(reportType),
    messages: [
      {
        role: 'user',
        content: `Business: ${businessName}
${periodLabel}

Metrics (JSON):
${JSON.stringify(data, null, 2)}

Write the ${reportType === 'quarterly_deep_dive' ? 'quarterly deep-dive' : 'weekly'} report.`,
      },
    ],
  })
  const text = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(cleaned) as ReportNarrative
  } catch {
    return {
      exec_summary: ['Report generation hit a parsing issue — raw data still in payload below.'],
    }
  }
}

export async function buildAndStoreReport(args: {
  supabase: SupabaseClient
  userId: string
  businessName: string
  windowStart: Date  // For weekly: Monday of the current week. For quarterly: 90 days back.
  reportType: ReportType
}): Promise<{ reportId: string; publicUrl: string }> {
  const windowDays = windowDaysFor(args.reportType)
  const data = await gatherWeeklyData(args.supabase, args.userId, args.windowStart, windowDays)
  const narrative = await generateNarrative(data, args.businessName, args.reportType)

  const { data: row, error } = await args.supabase
    .from('concierge_reports')
    .insert({
      user_id: args.userId,
      report_type: args.reportType,
      week_start: data.weekStart,
      payload: { data, narrative, business_name: args.businessName, report_type: args.reportType },
    })
    .select('id')
    .single()
  if (error || !row) throw new Error(`report insert: ${error?.message ?? 'no row'}`)

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
      ? process.env.NEXT_PUBLIC_APP_URL
      : 'https://www.bellavego.com'

  return { reportId: row.id, publicUrl: `${appUrl}/r/${row.id}` }
}

// Back-compat wrapper for callers that still expect the weekly-only signature.
export async function buildAndStoreWeeklyReport(args: {
  supabase: SupabaseClient
  userId: string
  businessName: string
  weekStart: Date
}): Promise<{ reportId: string; publicUrl: string }> {
  return buildAndStoreReport({
    supabase: args.supabase,
    userId: args.userId,
    businessName: args.businessName,
    windowStart: args.weekStart,
    reportType: 'weekly_strategy',
  })
}
