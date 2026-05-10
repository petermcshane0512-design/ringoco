import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { ConsultingReport, Confidence } from '@/lib/consultingReport'
import { SAMPLE_REPORT } from '@/lib/consultingReport'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type AgentInput = {
  meta: ConsultingReport['meta']
  performance: ConsultingReport['performance']
  marketScan: ConsultingReport['marketScan']
  competitive: ConsultingReport['competitive']
  bellaveScore: ConsultingReport['bellaveScore']
}

const SYSTEM = `You are BellAveGo Consulting's senior analyst. You generate quarterly consulting reports for home-service contractors based on their actual call/job data and local market research.

Your job: produce ONLY a JSON object with three fields — \`executiveSummary\`, \`opportunities\`, \`actionPlan\` — that fit the contractor's specific data. Be concrete. Use real dollar figures derived from the inputs. Do not be generic. Avoid corporate fluff.

Rules:
- Executive summary: 3 paragraphs. First paragraph summarizes the quarter using the contractor's actual numbers. Second paragraph isolates the single biggest opportunity. Third paragraph previews the action plan.
- Opportunities: exactly 3, ranked by addressable monthly revenue. Each must include a specific pattern (with numbers from the input data) and a concrete action the contractor can take this month.
- Action plan: 5 items, prioritized 1–5 by impact ÷ effort. Each item ties back to either an opportunity or a competitive gap.
- Confidence: "high" only if the pattern is supported by 3+ data points. Otherwise "medium" or "low".
- Effort: low = under 1 hour to set up. medium = 1–4 hours. high = a week of work or external help.
- All dollar values are integers. All percentages and ratios are floats 0–1.

Return ONLY valid JSON, no prose, no code fences.`

const RESPONSE_SHAPE = `{
  "executiveSummary": ["paragraph 1", "paragraph 2", "paragraph 3"],
  "opportunities": [
    { "rank": 1, "title": "...", "monthlyValue": 5200, "pattern": "...", "action": "...", "confidence": "high" }
  ],
  "actionPlan": [
    { "priority": 1, "title": "...", "rationale": "...", "expectedImpact": "...", "timeline": "...", "effort": "low" }
  ]
}`

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  let input: AgentInput
  try {
    input = (await req.json()) as AgentInput
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!input?.meta?.businessName || !input.performance) {
    return NextResponse.json({ error: 'Missing meta.businessName or performance' }, { status: 400 })
  }

  const prompt = `Contractor profile:
${JSON.stringify(input.meta, null, 2)}

Internal performance (last 90 days, BellAveGo dashboard):
${JSON.stringify(input.performance, null, 2)}

BellAveGo Score breakdown (1–10):
${JSON.stringify(input.bellaveScore, null, 2)}

Local market context (Census + Google Places):
${JSON.stringify(input.marketScan, null, 2)}

Competitive snapshot (Google Places, 8mi radius):
${JSON.stringify(input.competitive, null, 2)}

Generate the executiveSummary, opportunities, and actionPlan. Schema:
${RESPONSE_SHAPE}`

  try {
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = completion.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim()

    const cleaned = stripCodeFence(text)
    let parsed: { executiveSummary: string[]; opportunities: ConsultingReport['opportunities']; actionPlan: ConsultingReport['actionPlan'] }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Claude returned non-JSON', raw: text.slice(0, 500) }, { status: 502 })
    }

    const report: ConsultingReport = {
      meta: input.meta,
      performance: input.performance,
      bellaveScore: input.bellaveScore,
      marketScan: input.marketScan,
      competitive: input.competitive,
      executiveSummary: parsed.executiveSummary,
      opportunities: normalizeOpportunities(parsed.opportunities),
      actionPlan: normalizeActions(parsed.actionPlan),
      upsells: SAMPLE_REPORT.upsells,
      methodology: SAMPLE_REPORT.methodology,
    }

    return NextResponse.json({ report })
  } catch (err) {
    console.error('consulting-report agent error:', err)
    return NextResponse.json({ error: 'Generation failed', detail: String(err) }, { status: 500 })
  }
}

function stripCodeFence(s: string) {
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/
  const m = s.match(fence)
  return m ? m[1].trim() : s
}

function normalizeOpportunities(arr: ConsultingReport['opportunities']): ConsultingReport['opportunities'] {
  return (arr ?? []).slice(0, 3).map((o, i) => ({
    rank: i + 1,
    title: String(o.title ?? '').slice(0, 80),
    monthlyValue: Math.max(0, Math.round(Number(o.monthlyValue) || 0)),
    pattern: String(o.pattern ?? ''),
    action: String(o.action ?? ''),
    confidence: (['high', 'medium', 'low'] as Confidence[]).includes(o.confidence) ? o.confidence : 'medium',
  }))
}

function normalizeActions(arr: ConsultingReport['actionPlan']): ConsultingReport['actionPlan'] {
  return (arr ?? []).slice(0, 5).map((a, i) => ({
    priority: i + 1,
    title: String(a.title ?? '').slice(0, 80),
    rationale: String(a.rationale ?? ''),
    expectedImpact: String(a.expectedImpact ?? ''),
    timeline: String(a.timeline ?? ''),
    effort: (['low', 'medium', 'high'] as const).includes(a.effort) ? a.effort : 'medium',
  }))
}
