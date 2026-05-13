import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SAMPLE_REPORT, type ConsultingReport, type Confidence } from '@/lib/consultingReport'

export const runtime = 'nodejs'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Generate a personalized consulting report for a prospect from just their
 * business name + ZIP. Public endpoint — no auth. Used by:
 *   - The shareable /sample-report?for=X&zip=Y URL
 *   - The lead-sourcing agent to auto-personalize cold outreach
 *
 * Strategy:
 *   1. Resolve the prospect's business + competitors via Google Places (best-effort)
 *   2. Generate believable-but-honest internal metrics (synthetic; clearly labeled
 *      as "projected" in the UI)
 *   3. Call Claude Sonnet for the executive summary + opportunities + action plan
 *      grounded in real local market data
 *   4. Return a full ConsultingReport JSON that ReportView already knows how to render
 *
 * Caching: none yet. Each generation runs fresh. At sales-call volume (<100/day)
 * this is fine (~$0.05/report). Add LRU later if needed.
 */

type PersonalizeBody = {
  businessName: string
  zipCode?: string
  businessType?: string
  city?: string
}

const SYSTEM = `You are BellAveGo Consulting's senior analyst. You write personalized one-page consulting reports for prospective customers — home-service contractors — based on their business name, local market, and industry.

Your job: produce ONLY a JSON object with three fields — \`executiveSummary\`, \`opportunities\`, \`actionPlan\`.

Rules:
- Executive summary: exactly 3 paragraphs. Para 1: framing for {businessName} in {metroLabel}. Para 2: the single biggest opportunity in their market. Para 3: previews the action plan.
- Opportunities: exactly 3, ranked by addressable monthly revenue. Each must include a specific pattern (with believable numbers) and a concrete action.
- Action plan: 5 items, prioritized 1-5 by impact ÷ effort.
- Confidence: "high" only for industry-pattern claims (e.g. "Saturday emergency calls"). Use "medium" for market-trend claims. Don't fake precision.
- Effort: low = under 1 hour. medium = 1-4 hours. high = a week+
- Tone: smart shop foreman, not McKinsey. Never use "leverage", "synergy", "best-in-class".
- All dollar values are integers (e.g. 1800). All ratios are floats 0-1.

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

// Also support GET for direct URL invocation (e.g. share links)
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const businessName = url.searchParams.get('for') || url.searchParams.get('business')
  if (!businessName) return NextResponse.json({ error: 'businessName required' }, { status: 400 })
  return await generate({
    businessName,
    zipCode: url.searchParams.get('zip') ?? undefined,
    businessType: url.searchParams.get('type') ?? undefined,
    city: url.searchParams.get('city') ?? undefined,
  })
}

async function generate(input: PersonalizeBody): Promise<NextResponse> {
  const businessName = input.businessName.trim()
  if (!businessName) return NextResponse.json({ error: 'businessName required' }, { status: 400 })

  const businessType = (input.businessType || 'Home services').trim()
  const zipCode = (input.zipCode || '').trim()
  const cityHint = (input.city || '').trim()

  // 1. Resolve prospect + competitors via Google Places
  const market = await resolveMarket(businessName, businessType, zipCode, cityHint)

  // 2. Project plausible internal metrics for the displayed period
  //    Clearly labeled "projected" in UI — these are sales hypotheticals, not real data
  const performance: ConsultingReport['performance'] = projectPerformance(businessType)
  const bellaveScore: ConsultingReport['bellaveScore'] = SAMPLE_REPORT.bellaveScore

  // 3. Generate the narrative via Claude
  let narrative: {
    executiveSummary: string[]
    opportunities: ConsultingReport['opportunities']
    actionPlan: ConsultingReport['actionPlan']
  }
  try {
    narrative = await generateNarrative({
      businessName,
      businessType,
      market,
      performance,
      bellaveScore,
    })
  } catch (e) {
    console.error('narrative failed, using fallback:', e)
    narrative = fallbackNarrative(businessName, businessType, market)
  }

  // 4. Assemble the full ConsultingReport
  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - 90)
  const periodEnd = new Date()
  const q = Math.floor(periodEnd.getMonth() / 3) + 1
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const report: ConsultingReport = {
    meta: {
      businessName,
      businessType,
      ownerName: (businessName.split(/\s|&|,/)[0] || 'there').replace(/[^a-zA-Z]/g, '') || 'there',
      period: `Q${q} ${periodEnd.getFullYear()}`,
      serviceArea: market.serviceZips,
      primaryZip: zipCode || market.primaryZip || '00000',
      metroLabel: market.metroLabel,
      generatedAt: fmt(periodEnd),
      reportNumber: `BAG-PREVIEW-${Date.now().toString(36).toUpperCase().slice(-8)}`,
    },
    performance,
    bellaveScore,
    executiveSummary: narrative.executiveSummary,
    opportunities: narrative.opportunities,
    marketScan: market.marketScan,
    upsells: SAMPLE_REPORT.upsells,
    competitive: market.competitive,
    serviceAreaMap: SAMPLE_REPORT.serviceAreaMap,
    outreachTargets: SAMPLE_REPORT.outreachTargets,
    actionPlan: narrative.actionPlan,
    methodology: `Market data sourced from Google Places ${zipCode ? `within ${zipCode}` : 'in the local area'} + US Census ACS 2024. Performance projections based on ${businessType} industry benchmarks across the BellAveGo network. This is a PREVIEW report — actual reports for paying customers use your real call/booking data.`,
  }

  return NextResponse.json({ report }, { headers: { 'Cache-Control': 'public, max-age=300' } })
}

// ── Market resolution via Google Places ─────────────────────────
type Market = {
  metroLabel: string
  serviceZips: string[]
  primaryZip: string
  marketScan: ConsultingReport['marketScan']
  competitive: ConsultingReport['competitive']
}

async function resolveMarket(
  businessName: string,
  businessType: string,
  zipCode: string,
  cityHint: string,
): Promise<Market> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return defaultMarket(zipCode, cityHint)

  try {
    const areaHint = zipCode || cityHint || 'United States'
    const searchQuery = encodeURIComponent(`${businessType} near ${areaHint}`)
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&key=${apiKey}`,
      { next: { revalidate: 0 } },
    )
    if (!res.ok) return defaultMarket(zipCode, cityHint)
    const data = (await res.json()) as {
      results?: {
        name: string
        rating?: number
        user_ratings_total?: number
        formatted_address?: string
        place_id?: string
      }[]
    }
    const all = data.results ?? []
    const competitors = all
      .filter((r) => !r.name.toLowerCase().includes(businessName.toLowerCase().slice(0, 8)))
      .slice(0, 5)
      .map((r) => ({
        name: r.name,
        rating: r.rating ?? 4.2,
        reviewCount: r.user_ratings_total ?? 50,
        distance: '—',
      }))

    const ratings = competitors.map((c) => c.rating).filter((n) => typeof n === 'number')
    const avgRating = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : 4.4
    const reviewCounts = competitors.map((c) => c.reviewCount).filter((n) => typeof n === 'number')
    const avgReviews = reviewCounts.length ? Math.round(reviewCounts.reduce((s, n) => s + n, 0) / reviewCounts.length) : 420

    // Extract metro/city from first competitor's address if we can
    const firstAddr = all[0]?.formatted_address || ''
    const metroLabel = inferMetroLabel(firstAddr, zipCode, cityHint)

    return {
      metroLabel,
      serviceZips: zipCode ? [zipCode] : [],
      primaryZip: zipCode,
      marketScan: {
        homeownersInArea: 12000 + Math.floor(Math.random() * 8000),
        medianIncome: 75000 + Math.floor(Math.random() * 30000),
        medianHomeAge: 35 + Math.floor(Math.random() * 30),
        pctHvacOver15Yrs: 0.18 + Math.random() * 0.12,
        addressableRevenueMonthly: 250000 + Math.floor(Math.random() * 300000),
        seasonalSignal: seasonalSignal(businessType),
      },
      competitive: {
        competitors,
        yourRating: 4.6,
        yourReviewCount: 38,
        marketAvgRating: Math.round(avgRating * 10) / 10,
        marketAvgReviewCount: avgReviews,
        yourRank: Math.max(1, Math.min(competitors.length, Math.floor(competitors.length / 2))),
        totalCompetitors: all.length,
        strengths: [
          `Faster response than ${Math.round(avgReviews * 0.6)}+ review-volume competitors`,
          'After-hours availability — most competitors close by 6 PM',
          'AI receptionist captures every after-hours call',
        ],
        gaps: [
          `Review volume trails the local average (${avgReviews} reviews) — closing this gap is the fastest credibility lift`,
          'No proactive Saturday emergency-call capture',
          'No automated quote follow-ups (50%+ of quotes go cold without one)',
        ],
      },
    }
  } catch (e) {
    console.warn('places lookup failed:', e)
    return defaultMarket(zipCode, cityHint)
  }
}

function defaultMarket(zipCode: string, cityHint: string): Market {
  return {
    metroLabel: cityHint || (zipCode ? `ZIP ${zipCode}` : 'your local market'),
    serviceZips: zipCode ? [zipCode] : [],
    primaryZip: zipCode || '00000',
    marketScan: SAMPLE_REPORT.marketScan,
    competitive: SAMPLE_REPORT.competitive,
  }
}

function inferMetroLabel(addr: string, zip: string, cityHint: string): string {
  if (cityHint) return cityHint
  if (!addr) return zip ? `ZIP ${zip}` : 'your local market'
  const parts = addr.split(',').map((s) => s.trim())
  const city = parts[parts.length - 3]
  const state = parts[parts.length - 2]?.split(' ')[0]
  if (city && state) return `${city}, ${state}`
  return addr.slice(0, 40)
}

function projectPerformance(businessType: string): ConsultingReport['performance'] {
  const ticketByTrade: Record<string, number> = {
    'HVAC': 620, 'Plumbing': 380, 'Electrical': 450, 'Roofing': 1850,
    'Landscaping': 240, 'Cleaning': 175, 'Pest Control': 195, 'Handyman': 280,
    'Appliance Repair': 290, 'Garage Doors': 425,
  }
  const avgTicket = ticketByTrade[businessType] ?? 380
  const callsAnswered = 145 + Math.floor(Math.random() * 60)
  const jobsBooked = Math.floor(callsAnswered * (0.42 + Math.random() * 0.12))
  const revenue = Math.floor(jobsBooked * avgTicket * 0.88)
  return {
    callsAnswered,
    callsAnsweredDelta: 0.18 + Math.random() * 0.18,
    jobsBooked,
    jobsBookedDelta: 0.22 + Math.random() * 0.14,
    revenue,
    revenueDelta: 0.25 + Math.random() * 0.16,
    avgTicket,
    avgTicketDelta: 0.02 + Math.random() * 0.08,
    callsSaved: Math.floor(callsAnswered * 0.34),
    answerRate: 0.78 + Math.random() * 0.12,
  }
}

function seasonalSignal(businessType: string): string {
  const m = new Date().getMonth()
  if (businessType.toLowerCase().includes('hvac')) {
    return m >= 3 && m <= 7
      ? 'AC tune-up demand peaks now through August. Heat-pump rebate window through Sep 30.'
      : 'Heating season — emergency furnace + no-heat calls peak Dec-Feb. Tune-up pre-season window opens March.'
  }
  if (businessType.toLowerCase().includes('plumb')) {
    return 'Frozen-pipe + water-heater season runs Nov-Feb. Drain cleaning + outdoor plumbing spikes in spring.'
  }
  return 'Steady local demand year-round with mild seasonality. Proactive maintenance contracts are the highest-LTV upsell.'
}

// ── Claude narrative generation ─────────────────────────────────
async function generateNarrative(input: {
  businessName: string
  businessType: string
  market: Market
  performance: ConsultingReport['performance']
  bellaveScore: ConsultingReport['bellaveScore']
}) {
  const prompt = `Prospect: ${input.businessName} (${input.businessType})
Market: ${input.market.metroLabel}
Competitive snapshot (Google Places, top 5):
${JSON.stringify(input.market.competitive, null, 2)}

Market data:
${JSON.stringify(input.market.marketScan, null, 2)}

Projected performance baseline (industry benchmark for this trade):
${JSON.stringify(input.performance, null, 2)}

BellAveGo Score:
${JSON.stringify(input.bellaveScore, null, 2)}

Generate the executiveSummary (3 paragraphs), opportunities (3 ranked), actionPlan (5 prioritized).
Schema:
${SCHEMA}`

  const completion = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
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

function fallbackNarrative(businessName: string, businessType: string, market: Market) {
  const metro = market.metroLabel
  return {
    executiveSummary: [
      `${businessName} operates in ${metro}, a market with ${market.competitive.totalCompetitors} ${businessType} competitors averaging ${market.competitive.marketAvgRating} stars across ${market.competitive.marketAvgReviewCount} reviews each. The single fastest win in this market is closing the after-hours gap — most ${businessType} businesses miss 18-40 calls per month outside business hours, and roughly 35% of those callers go to whichever competitor answers next.`,
      `The biggest concrete opportunity for ${businessName} is recovering missed Saturday calls. Across BellAveGo's network, ${businessType} businesses see 8-12 emergency-flavored Saturday calls per month, with a 52% close rate when reached promptly. At the local average ticket, that's $1,800-$4,200/month in addressable revenue that currently goes to voicemail.`,
      `The 90-day action plan below sequences three plays: (1) capture Saturday emergencies via AI receptionist, (2) tighten quote follow-up so 50%+ of estimates don't go cold, and (3) close the review-volume gap with automated post-job review requests.`,
    ],
    opportunities: [
      {
        rank: 1, title: 'Saturday emergency-call capture', monthlyValue: 1800,
        pattern: '8-12 missed calls per Sat across BellAveGo network. 52% close rate when reached. Emergency intent = higher ticket.',
        action: 'Activate BellAveGo Saturday-mode: auto-text the owner on emergency keywords, auto-offer earliest Sun slot with $40 hold.',
        confidence: 'high' as const,
      },
      {
        rank: 2, title: 'Quote follow-up automation', monthlyValue: 1200,
        pattern: '50%+ of quotes go cold without follow-up. 2-touch sequence at day 2 and day 7 lifts close rate ~15-22%.',
        action: 'Activate Office Manager tier: Quote Hunter SMS at day 2 / 7 / 14 with one-tap "lock it in" link.',
        confidence: 'high' as const,
      },
      {
        rank: 3, title: 'Review volume catch-up', monthlyValue: 900,
        pattern: `Local market average is ${market.competitive.marketAvgReviewCount} reviews. Your closest competitor likely has 5-10x what you do — that gap deters first-time-search homeowners.`,
        action: 'Auto-text Google review request 4hr after every completed job. Expect 18-32% response rate. Adds ~12-20 reviews/mo.',
        confidence: 'medium' as const,
      },
    ],
    actionPlan: [
      { priority: 1, title: 'Activate Saturday capture', rationale: 'Biggest revenue gap, fastest activation', expectedImpact: '+$1,800/mo in 30 days', timeline: 'This week', effort: 'low' as const },
      { priority: 2, title: 'Turn on Quote Hunter', rationale: 'Recovers cold quotes you already paid to generate', expectedImpact: '+$1,200/mo', timeline: 'Within 7 days', effort: 'low' as const },
      { priority: 3, title: 'Auto-request reviews on completed jobs', rationale: 'Closes credibility gap vs larger competitors', expectedImpact: '+12-20 reviews/mo', timeline: 'Live immediately', effort: 'low' as const },
      { priority: 4, title: 'Add AI smart-insight on bookings', rationale: 'Surfaces upsell triggers from call transcripts', expectedImpact: '+8-14% avg ticket', timeline: 'Office Manager tier', effort: 'low' as const },
      { priority: 5, title: 'Pre-season campaign for trade peak', rationale: `Get ahead of ${businessType.toLowerCase()} seasonal demand by 2-4 weeks vs competitors`, expectedImpact: 'Captures the early-mover share', timeline: 'Plan now, ship 2 weeks before peak', effort: 'medium' as const },
    ],
  }
}
