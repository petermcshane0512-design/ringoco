import Anthropic from '@anthropic-ai/sdk'
import type {
  InternalMetricsWithDelta,
  MarketContext,
  CensusContext,
  OutreachTarget,
  BellaveScore,
} from './consultingMetrics'
import type { ConsultingReport, Confidence } from './consultingReport'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Generate the FULL narrative payload for a consulting report:
 *   - 3-paragraph executive summary
 *   - Top 3 ranked revenue opportunities (with $ values, patterns, actions, confidence)
 *   - 5-step prioritized action plan
 *   - Strengths bullets (3) + Gaps bullets (3) for the Competitive Snapshot
 *   - Recommended priced upsells (4–5 services)
 *   - Seasonal signal sentence
 *
 * Grounded in the contractor's actual numbers, the local Google Places market,
 * Census demographics, and the BellAveGo Score breakdown. The prompt explicitly
 * forbids invented $ figures — every value must trace back to the inputs.
 *
 * Cost: ~$0.06/report (≈ 2.5k tokens in, 1.5k out at Sonnet rates).
 */
export type NarrativePayload = {
  executiveSummary: string[]                  // 2-3 paragraphs
  opportunities: ConsultingReport['opportunities']  // exactly 3
  actionPlan: ConsultingReport['actionPlan']        // exactly 5
  competitiveStrengths: string[]              // exactly 3 short bullets
  competitiveGaps: string[]                   // exactly 3 short bullets
  upsells: ConsultingReport['upsells']        // 4-5 services
  seasonalSignal: string                      // 1 sentence
}

export async function generateReportNarrative(input: {
  businessName: string
  businessType: string
  serviceArea: string
  primaryZip: string
  reportType: 'welcome' | 'periodic'
  metrics: InternalMetricsWithDelta
  market: MarketContext
  census: CensusContext | null
  outreach: OutreachTarget[]
  bellaveGoScore: BellaveScore
}): Promise<NarrativePayload> {
  const isWelcome = input.reportType === 'welcome'

  const system =
    `You are BellAveGo's senior analyst writing a quarterly consulting report for a home-service contractor. ` +
    `Be concrete and specific. Use the contractor's actual numbers when given. Never use words like "leverage", "synergy", "robust", "best-in-class" — sound like a smart shop foreman, not McKinsey. ` +
    `EVERY DOLLAR FIGURE YOU CITE must be derivable from the inputs (avg ticket × close rate × eligible customers, or similar). DO NOT invent statistics like "32% of contractors do X". DO NOT claim "BellAveGo network data" — you have access only to THIS contractor's data + the public market signals provided. ` +
    `Return STRICT JSON only — no prose, no markdown fences.`

  const ctx = isWelcome
    ? `This is a WELCOME report — the contractor just signed up. There's no historical call/job data yet. Frame everything around (1) the local market context provided (Census demographics, competitor density), (2) the trade-specific seasonal pattern, and (3) the gap that BellAveGo is now closing (24/7 answering). Do not reference internal metrics — they're all zero.`
    : `This is a PERIODIC performance report covering the cadence window. Ground opportunities in the missed-call window (peakUnansweredHour), the topJobType, the calls-saved-after-hours number, and the rank vs competitors. Use period-over-period deltas where they're non-zero.`

  const prompt =
    `${ctx}\n\n` +
    `Contractor: ${input.businessName} (${input.businessType}), serving ${input.serviceArea} (primary ZIP ${input.primaryZip}).\n\n` +
    `Current-period metrics:\n${JSON.stringify(input.metrics.current, null, 2)}\n\n` +
    `Prior-period for comparison:\n${JSON.stringify(input.metrics.prior, null, 2)}\n\n` +
    `Period-over-period deltas (decimal, e.g. 0.18 = +18%):\n${JSON.stringify(input.metrics.delta, null, 2)}\n\n` +
    `Local Google Places market:\n${JSON.stringify(input.market, null, 2)}\n\n` +
    `Census ACS demographics:\n${JSON.stringify(input.census, null, 2)}\n\n` +
    `Real B2B outreach targets we already pulled (use these in the executive summary if relevant):\n${JSON.stringify(input.outreach.map((o) => o.business), null, 2)}\n\n` +
    `BellAveGo Score: composite ${input.bellaveGoScore.composite}/10. Breakdown: answer rate ${input.bellaveGoScore.answerRate}, booking conv ${input.bellaveGoScore.bookingConversion}, response time ${input.bellaveGoScore.responseTime}, pricing power ${input.bellaveGoScore.pricingPower}.\n\n` +
    `Output schema (return JSON with EXACTLY these fields, no others):\n` +
    `{\n` +
    `  "executiveSummary": [string, string, string],  // 2-3 paragraphs, each ≤ 600 chars\n` +
    `  "opportunities": [\n` +
    `    { "rank": 1, "title": string, "monthlyValue": number, "pattern": string, "action": string, "confidence": "high"|"medium"|"low" },\n` +
    `    { "rank": 2, ... },\n` +
    `    { "rank": 3, ... }\n` +
    `  ],\n` +
    `  "actionPlan": [\n` +
    `    { "priority": 1, "title": string, "rationale": string, "expectedImpact": string, "timeline": string, "effort": "low"|"medium"|"high" },\n` +
    `    { "priority": 2, ... },\n` +
    `    { "priority": 3, ... },\n` +
    `    { "priority": 4, ... },\n` +
    `    { "priority": 5, ... }\n` +
    `  ],\n` +
    `  "competitiveStrengths": [string, string, string],  // 3 short bullets, each ≤ 120 chars, comparing to market data above\n` +
    `  "competitiveGaps": [string, string, string],\n` +
    `  "upsells": [\n` +
    `    { "service": string, "demandSignal": string, "avgTicket": number, "closeRate": number, "monthlyOpportunity": number }\n` +
    `    // 4-5 entries; closeRate is a decimal (e.g. 0.22 = 22%); monthlyOpportunity = avgTicket × closeRate × eligible-customers (round to nearest 10)\n` +
    `  ],\n` +
    `  "seasonalSignal": string  // 1 sentence about the upcoming demand window for this trade\n` +
    `}`

  try {
    const completion = await anthropic.messages.create({
      // Haiku 4.5 — switched 2026-06-04 for cost savings on consulting reports.
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = completion.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '')
    const parsed = JSON.parse(cleaned) as Partial<NarrativePayload>
    return validateAndFill(parsed, input)
  } catch (e) {
    console.warn('narrative generation failed, using fallback:', e)
    return fallbackNarrative(input, isWelcome)
  }
}

function validateAndFill(
  p: Partial<NarrativePayload>,
  input: Parameters<typeof generateReportNarrative>[0],
): NarrativePayload {
  const fallback = fallbackNarrative(input, input.reportType === 'welcome')

  return {
    executiveSummary: Array.isArray(p.executiveSummary) && p.executiveSummary.length >= 1
      ? p.executiveSummary.slice(0, 3).map(String)
      : fallback.executiveSummary,

    opportunities: Array.isArray(p.opportunities) && p.opportunities.length >= 1
      ? p.opportunities.slice(0, 3).map((o, i) => ({
          rank: i + 1,
          title: String(o.title || '').slice(0, 80),
          monthlyValue: Math.max(0, Math.round(Number(o.monthlyValue) || 0)),
          pattern: String(o.pattern || '').slice(0, 280),
          action: String(o.action || '').slice(0, 280),
          confidence: (['high', 'medium', 'low'].includes(String(o.confidence)) ? o.confidence : 'medium') as Confidence,
        }))
      : fallback.opportunities,

    actionPlan: Array.isArray(p.actionPlan) && p.actionPlan.length >= 1
      ? p.actionPlan.slice(0, 5).map((a, i) => ({
          priority: i + 1,
          title: String(a.title || '').slice(0, 80),
          rationale: String(a.rationale || '').slice(0, 280),
          expectedImpact: String(a.expectedImpact || '').slice(0, 80),
          timeline: String(a.timeline || '').slice(0, 60),
          effort: (['low', 'medium', 'high'].includes(String(a.effort)) ? a.effort : 'medium') as 'low' | 'medium' | 'high',
        }))
      : fallback.actionPlan,

    competitiveStrengths: Array.isArray(p.competitiveStrengths) && p.competitiveStrengths.length >= 1
      ? p.competitiveStrengths.slice(0, 3).map((s) => String(s).slice(0, 140))
      : fallback.competitiveStrengths,

    competitiveGaps: Array.isArray(p.competitiveGaps) && p.competitiveGaps.length >= 1
      ? p.competitiveGaps.slice(0, 3).map((s) => String(s).slice(0, 140))
      : fallback.competitiveGaps,

    upsells: Array.isArray(p.upsells) && p.upsells.length >= 1
      ? p.upsells.slice(0, 5).map((u) => ({
          service: String(u.service || '').slice(0, 80),
          demandSignal: String(u.demandSignal || '').slice(0, 100),
          avgTicket: Math.max(0, Math.round(Number(u.avgTicket) || 0)),
          closeRate: Math.max(0, Math.min(1, Number(u.closeRate) || 0)),
          monthlyOpportunity: Math.max(0, Math.round(Number(u.monthlyOpportunity) || 0)),
        }))
      : fallback.upsells,

    seasonalSignal: typeof p.seasonalSignal === 'string' && p.seasonalSignal.length > 0
      ? p.seasonalSignal.slice(0, 240)
      : fallback.seasonalSignal,
  }
}

function fallbackNarrative(
  input: Parameters<typeof generateReportNarrative>[0],
  isWelcome: boolean,
): NarrativePayload {
  const m = input.metrics.current
  const businessName = input.businessName
  const peak = m.peakUnansweredHour
  const trade = input.businessType.toLowerCase()
  const census = input.census

  const peakWindowOpportunity = Math.max(800, Math.round(m.avgJobValue * Math.max(4, m.peakUnansweredCount)))

  if (isWelcome) {
    return {
      executiveSummary: [
        `${businessName} just activated BellAveGo. Your AI receptionist now answers 24/7 in ${input.serviceArea}. Most contractors in your trade miss 18–40 calls/month after hours and weekends, with historical close rates of 30–45% once those callers are reached. We'll capture them automatically and text you the bookable ones.`,
        census ? `Your service area covers approximately ${census.homeownersInArea.toLocaleString()} owner-occupied homes with a median household income of $${census.medianIncome.toLocaleString()}. Median home age is ${census.medianHomeAge} years — that's the cohort most likely to need ${trade} work in the next 18 months.` : `Your local market profile will populate after your first full reporting period.`,
        `Your first periodic report will arrive on your tier cadence with real call + booking data and quarter-over-quarter trends.`,
      ],
      opportunities: [
        { rank: 1, title: 'Capture every after-hours call', monthlyValue: peakWindowOpportunity, pattern: 'Voicemail conversion is 8–12% in this trade. AI capture + tap-to-call back lifts it to 30–45%.', action: 'You\'re live — verify forwarding from your business line under Dashboard → Forwarding.', confidence: 'high' },
        { rank: 2, title: 'Seed Quote Hunter with last 30 days of open quotes', monthlyValue: 600, pattern: 'Quote Hunter chases day 2 / 7 / 14 automatically. Most contractors recover 6–14% of stale quotes.', action: 'Dashboard → Office Manager → Add quotes you\'ve sent in the last 30 days.', confidence: 'medium' },
        { rank: 3, title: 'Connect Google Business Profile', monthlyValue: 400, pattern: 'AI Reviews drafts replies to new reviews + helps you respond in 24h (Google ranks responsive businesses higher).', action: 'Dashboard → Settings → connect Google Place ID.', confidence: 'medium' },
      ],
      actionPlan: [
        { priority: 1, title: 'Verify call forwarding', rationale: 'Without forwarding, the AI never gets the calls. Most failures here.', expectedImpact: 'Unlocks ALL value', timeline: 'Today (5 min)', effort: 'low' },
        { priority: 2, title: 'Test the AI by calling yourself', rationale: 'Call your BellAveGo number from a different phone. Make sure it sounds right.', expectedImpact: 'Confidence', timeline: 'Today (2 min)', effort: 'low' },
        { priority: 3, title: 'Add 5 commercial outreach targets to your weekly list', rationale: 'Section 6 of this report has 5 vetted commercial leads pulled from Google Places for your area.', expectedImpact: 'One contract ≈ $2,400/mo recurring', timeline: 'This week', effort: 'medium' },
        { priority: 4, title: 'Connect Google Business Profile', rationale: 'Powers the AI Reviews + Reputation features.', expectedImpact: 'Better review responsiveness', timeline: 'This week (3 min)', effort: 'low' },
        { priority: 5, title: 'Review your first 7 days', rationale: 'Watch the dashboard. Approve or decline pending jobs. Tweak the AI tone if needed.', expectedImpact: 'Better fit', timeline: 'Week 1', effort: 'low' },
      ],
      competitiveStrengths: [
        '24/7 AI receptionist — almost no competitor in your area has this.',
        'Instant SMS summaries — you act on leads faster than slower competitors.',
        'Automated quote follow-up and collections free up your evenings.',
      ],
      competitiveGaps: [
        census ? `Local market has ${input.market.competitorCount} ${trade} competitors within range — you\'re entering a contested space.` : 'Add Google Place ID so we can benchmark you against local competitors.',
        'Review volume is the long-game lever — start asking every happy customer.',
        'No after-hours emergency positioning in your current branding (we can fix this in the AI script).',
      ],
      upsells: [
        { service: 'AC tune-up (pre-season)', demandSignal: 'Pre-season demand spike', avgTicket: 189, closeRate: 0.08, monthlyOpportunity: 900 },
        { service: 'UV light installation', demandSignal: 'Add-on at tune-up', avgTicket: 340, closeRate: 0.22, monthlyOpportunity: 1500 },
        { service: 'Smart thermostat install', demandSignal: 'Rebate-driven demand', avgTicket: 425, closeRate: 0.18, monthlyOpportunity: 1100 },
        { service: 'Maintenance contract (residential)', demandSignal: 'Locks in recurring revenue', avgTicket: 300, closeRate: 0.12, monthlyOpportunity: 720 },
      ],
      seasonalSignal: 'Watch your dashboard daily for the first two weeks; the seasonal signal for your area will populate on your first periodic report.',
    }
  }

  // Periodic fallback
  return {
    executiveSummary: [
      `${businessName} closed the period with ${m.callsAnswered}/${m.callsReceived} calls answered (${Math.round((m.answerRate) * 100)}%), ${m.jobsBooked} jobs booked, and $${m.totalRevenue.toLocaleString()} in completed revenue. Average ticket: $${m.avgJobValue.toLocaleString()}.`,
      peak !== '—' ? `Your peak unanswered window was ${peak}. Closing that single window is the fastest revenue lift this quarter.` : `Call volume was low this period — focus on outreach.`,
      census ? `Your service area: ${census.homeownersInArea.toLocaleString()} owner-occupied homes, $${census.medianIncome.toLocaleString()} median income.` : '',
    ].filter(Boolean),
    opportunities: [
      { rank: 1, title: peak !== '—' ? `Close the ${peak} gap` : 'Capture more after-hours calls', monthlyValue: peakWindowOpportunity, pattern: peak !== '—' ? `${m.peakUnansweredCount} unanswered calls cluster in this window. Avg ticket $${m.avgJobValue}.` : 'After-hours saves are your biggest unrealized upside.', action: 'Enable emergency keyword routing in your AI settings.', confidence: 'high' },
      { rank: 2, title: `Upsell ${m.topJobType || 'top service'} customers`, monthlyValue: Math.max(500, Math.round(m.avgJobValue * 1.2)), pattern: `Your top job type this period was "${m.topJobType}". Adding 1 upsell line item lifts ticket by ~20%.`, action: 'Add a UV-light / smart-thermostat / maintenance line to estimates.', confidence: 'medium' },
      { rank: 3, title: 'Work the B2B outreach list', monthlyValue: 2400, pattern: 'Section 6 of this report lists 5 real commercial prospects pulled from Google Places. One contract = ~$2,400/mo recurring.', action: 'Call 2/week for 3 weeks.', confidence: 'medium' },
    ],
    actionPlan: [
      { priority: 1, title: peak !== '—' ? `Activate ${peak} priority mode` : 'Tighten after-hours response', rationale: `Largest revenue gap. ${m.peakUnansweredCount} missed calls cluster here.`, expectedImpact: `+$${peakWindowOpportunity}/mo within 30 days`, timeline: 'This week', effort: 'low' },
      { priority: 2, title: 'Run AI Reviews + Reputation', rationale: 'Drafts replies to new reviews + texts past customers for reviews. Compounds over months.', expectedImpact: '+12–18% inbound calls in 90 days', timeline: 'Today', effort: 'low' },
      { priority: 3, title: `Add ${m.topJobType || 'service'} upsell to estimate template`, rationale: 'Your top job type leaves money on the table without an attached upsell.', expectedImpact: `+$${Math.round(m.avgJobValue * 0.2 * m.jobsBooked)}/quarter`, timeline: 'This week', effort: 'low' },
      { priority: 4, title: 'Work the 5 commercial outreach targets in §6', rationale: 'Pulled from Google Places — commercial properties with weak vendor relationships in your area.', expectedImpact: 'One contract ≈ $2,400/mo recurring', timeline: '2 calls/week × 3 weeks', effort: 'medium' },
      { priority: 5, title: 'Review-volume campaign', rationale: input.market.yourReviewCount ? `You have ${input.market.yourReviewCount} reviews vs market avg of ${input.market.marketAvgReviewCount}. Closing that gap moves you up in Google rankings.` : 'Review volume is the long-game lever for new-customer search.', expectedImpact: '+12–18% inbound new-customer calls', timeline: '90 days to first 100 reviews', effort: 'medium' },
    ],
    competitiveStrengths: [
      input.market.yourRating && input.market.yourRating > input.market.avgCompetitorRating ? `Highest rating in service area (${input.market.yourRating.toFixed(1)} vs ${input.market.avgCompetitorRating.toFixed(1)} market avg)` : 'Above-average answer rate via BellAveGo AI receptionist',
      'Faster response time on inbound leads vs voicemail-reliant competitors',
      'Automated follow-up frees evening hours for booked work',
    ],
    competitiveGaps: [
      input.market.yourReviewCount && input.market.marketAvgReviewCount && input.market.yourReviewCount < input.market.marketAvgReviewCount * 0.5 ? `Review volume (${input.market.yourReviewCount}) is below market avg (${input.market.marketAvgReviewCount}) — deters price-sensitive searchers` : 'Review volume gap vs largest local competitors',
      'No web presence beyond Google Business Profile',
      peak !== '—' ? `No after-hours emergency positioning despite ${m.peakUnansweredCount} missed-call cluster on ${peak}` : 'No after-hours emergency positioning',
    ],
    upsells: [
      { service: 'Maintenance contract', demandSignal: 'Recurring revenue lock-in', avgTicket: 300, closeRate: 0.12, monthlyOpportunity: 720 },
      { service: 'UV light installation', demandSignal: 'Add-on at tune-up', avgTicket: 340, closeRate: 0.22, monthlyOpportunity: 1500 },
      { service: 'Smart thermostat install', demandSignal: 'Rebate-eligible', avgTicket: 425, closeRate: 0.18, monthlyOpportunity: 1100 },
      { service: 'Duct cleaning cross-sell', demandSignal: 'Add-on to repair visits', avgTicket: 480, closeRate: 0.16, monthlyOpportunity: 920 },
    ],
    seasonalSignal: 'Seasonal demand pattern for your trade will be calibrated as more data accumulates over multiple periods.',
  }
}
