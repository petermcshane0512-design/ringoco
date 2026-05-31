/**
 * Claude-powered prospect scorer.
 *
 * Given the signals (from fetchSignals.ts), asks Claude Haiku 4.5 to score
 * the prospect 1-10 on "likelihood to convert to paid BellAveGo customer."
 *
 * Cheap by design: Haiku 4.5 at ~$0.001 per scoring call. 10K leads = $10.
 *
 * Self-learning: the system prompt is loaded from DB
 * (lead_scoring_prompts, is_active=true). Updated nightly by
 * learnFromConverted.ts based on which signals correlate with actual paid
 * conversions.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { ProspectSignals, ScoreResult } from './types'

const DEFAULT_VERSION = 'v1-2026-05-30'

const FALLBACK_PROMPT = `You are a sales rep scoring small home-service contractor prospects for BellAveGo, an AI receptionist SaaS targeting 1-5 employee owner-operator businesses ($147/mo Starter tier).

The IDEAL buyer:
- 1-5 employees (owner answers the phone himself)
- 5-60 Google reviews (real shop, but not big enough for staff)
- 4.0+ rating (cares about quality)
- Has a website but it's basic / no booking system / no answering service mentioned
- Sun Belt / always-busy market (HVAC + plumbing peak season urgency)
- NO mention of "answering service" / "24/7 receptionist" / "dispatch team" anywhere

NEGATIVE signals (lower score):
- 150+ reviews → has staff, has receptionist already
- Mentions "answering service" or "live answer" → already has the solution
- Strong online booking system → doesn't need phone capture
- Negative review sentiment → bad customer foundation
- 0 reviews or 1-2 reviews → not a real business yet
- Tiny employee estimate but rating <4.0 → unhappy customers = won't pay

Score:
1-3 = SKIP (don't email)
4-6 = OK (send if pipeline has room)
7-8 = SEND (good fit)
9-10 = PRIORITY (perfect ICP)

Return ONLY a JSON object:
{
  "buyer_score": <1-10>,
  "reasoning": {
    "positive_signals": ["short bullet", "..."],
    "negative_signals": ["short bullet", "..."],
    "one_line_summary": "one sentence why"
  },
  "send_recommendation": "send" | "send_priority" | "skip"
}`

export async function scoreProspect(signals: ProspectSignals): Promise<ScoreResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Load active scoring prompt (self-learning version) or fall back
  const { data: activePrompt } = await supabase
    .from('lead_scoring_prompts')
    .select('version, prompt_text')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const systemPrompt = activePrompt?.prompt_text ?? FALLBACK_PROMPT
  const version = activePrompt?.version ?? DEFAULT_VERSION

  const userPayload = JSON.stringify({
    business_name: signals.business_name,
    trade: signals.trade,
    city: signals.city,
    state: signals.state,
    review_count: signals.review_count,
    rating: signals.rating,
    employee_count_est: signals.employee_count_est,
    recent_review_sentiment: signals.recent_review_sentiment,
    has_answering_service_mentioned: signals.has_answering_service_mentioned,
    has_booking_system: signals.has_booking_system,
    emergency_service_listed: signals.emergency_service_listed,
    website_snippet_first_500: (signals.website_snippet || '').slice(0, 500),
  })

  const client = new Anthropic()
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Score this prospect.\n\n${userPayload}` }],
  })

  const text = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()

  let parsed: any = {}
  try {
    // strip ```json fences if present
    const cleaned = text.replace(/```json\s*|\s*```$/gi, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    // fall back if Claude returned unstructured text
    parsed = {
      buyer_score: 5,
      reasoning: { positive_signals: [], negative_signals: ['parse_error'], one_line_summary: text.slice(0, 200) },
      send_recommendation: 'send',
    }
  }

  // Hard clamp + sanity
  const score = Math.max(1, Math.min(10, Math.round(parsed.buyer_score ?? 5)))

  return {
    buyer_score: score,
    reasoning: parsed.reasoning ?? { positive_signals: [], negative_signals: [], one_line_summary: '' },
    send_recommendation: parsed.send_recommendation ?? (score >= 7 ? 'send' : 'skip'),
    score_version: version,
  }
}
