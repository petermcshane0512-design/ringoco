import Anthropic from '@anthropic-ai/sdk'
import type { ReportInput } from './generateReport'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Use Claude Sonnet to write the narrative pieces of a consulting report —
 * the headline opportunity and the "next quarter" outlook — grounded in the
 * contractor's actual numbers and local market context.
 *
 * Cost: ~$0.04/report (≈ 1.5k tokens in, 600 out).
 */
export async function generateReportNarrative(input: {
  businessName: string
  businessType: string
  serviceArea: string
  reportType: 'welcome' | 'periodic'
  metrics: ReportInput['metrics']
  market: ReportInput['market']
  bellaveGoScore: ReportInput['bellaveGoScore']
}): Promise<{
  opportunity: ReportInput['opportunity']
  nextQuarter: string
}> {
  const isWelcome = input.reportType === 'welcome'

  const system =
    `You are BellAveGo Consulting's senior analyst writing a 1-page report for a home-service contractor. ` +
    `Be concrete. Use the contractor's actual numbers when given. ` +
    `Never use words like "leverage" "synergy" "robust" "best-in-class" — sound like a smart shop foreman, not McKinsey. ` +
    `Return ONLY a JSON object with three fields: opportunity.headline (≤80 char), opportunity.body (2–3 sentences, ≤320 char), ` +
    `opportunity.estimatedValue (e.g. "$1,800/mo additional revenue"), and nextQuarter (2–3 sentences, ≤400 char).`

  const ctx = isWelcome
    ? `This is a WELCOME report — the contractor just signed up. There's no historical data yet. ` +
      `Frame the opportunity as the single biggest pattern from their business profile and local market. ` +
      `Don't reference internal call/booking numbers (they're all zero). Use market data + business type instead.`
    : `This is a PERIODIC performance report covering the last cadence window. ` +
      `Ground the opportunity in the missed-call window (peakUnansweredHour), the topJobType, and the rank vs competitors.`

  const prompt =
    `${ctx}\n\n` +
    `Contractor: ${input.businessName} (${input.businessType}), serving ${input.serviceArea}.\n\n` +
    `Internal metrics (last window):\n${JSON.stringify(input.metrics, null, 2)}\n\n` +
    `Local market:\n${JSON.stringify(input.market, null, 2)}\n\n` +
    `BellAveGo Score: composite ${input.bellaveGoScore.composite}/10 — breakdown ${JSON.stringify(input.bellaveGoScore.breakdown)}.\n\n` +
    `Schema:\n{\n  "opportunity": { "headline": "...", "body": "...", "estimatedValue": "$X/mo additional revenue" },\n  "nextQuarter": "..."\n}`

  try {
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = completion.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '')
    const parsed = JSON.parse(cleaned) as {
      opportunity: ReportInput['opportunity']
      nextQuarter: string
    }
    return {
      opportunity: {
        headline: String(parsed.opportunity?.headline ?? '').slice(0, 100),
        body: String(parsed.opportunity?.body ?? '').slice(0, 400),
        estimatedValue: String(parsed.opportunity?.estimatedValue ?? '$0/mo'),
      },
      nextQuarter: String(parsed.nextQuarter ?? '').slice(0, 500),
    }
  } catch (e) {
    console.warn('narrative generation failed, using fallback:', e)
    return fallbackNarrative(input, isWelcome)
  }
}

function fallbackNarrative(
  input: {
    businessName: string
    businessType: string
    serviceArea: string
    metrics: ReportInput['metrics']
    market: ReportInput['market']
  },
  isWelcome: boolean,
): { opportunity: ReportInput['opportunity']; nextQuarter: string } {
  if (isWelcome) {
    return {
      opportunity: {
        headline: `${input.businessType || 'Home services'} demand in ${input.serviceArea} is steady — capture every missed call.`,
        body: `BellAveGo is now answering 24/7 for ${input.businessName}. Most contractors in your trade miss 18–40 calls/month after hours and weekends, and historical close rate on those calls is 30–45% once reached. We'll capture them automatically.`,
        estimatedValue: '$1,500–$4,000/mo addressable',
      },
      nextQuarter:
        `Watch your dashboard daily for the first 2 weeks. Approve or decline pending jobs by reply (YES/NO). Your first periodic performance report will arrive based on your tier cadence.`,
    }
  }
  return {
    opportunity: {
      headline:
        input.metrics.peakUnansweredHour !== '—'
          ? `Your biggest missed window is ${input.metrics.peakUnansweredHour}.`
          : 'Capture more after-hours calls.',
      body: `Over the last window you received ${input.metrics.callsReceived} calls and booked ${input.metrics.jobsBooked} jobs. Your top job type was ${input.metrics.topJobType}. Tightening response in the peak unanswered window is the fastest revenue lift.`,
      estimatedValue: `$${Math.max(800, Math.round(input.metrics.avgJobValue * 4))}/mo additional`,
    },
    nextQuarter:
      `Next window: watch the daily SMS approval flow. Higher tiers automate quote follow-ups, collections, and review-reply drafts — upgrade if you want those running while you focus on jobs.`,
  }
}
