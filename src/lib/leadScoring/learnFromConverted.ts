/**
 * Self-learning loop. Runs nightly via /api/crons/learn-lead-scoring.
 *
 * Algorithm:
 *  1. Pull every outreach_lead.status that hit a positive outcome since
 *     last run (replied_interested, trial_started, paid).
 *  2. Snapshot their signals into lead_scoring_signals with appropriate
 *     weight (paid=5, trial=2, interested=1, bounced=-0.5).
 *  3. Pull every NEGATIVE outcome too (bounced, unsubscribed, hostile) —
 *     learning from rejection matters as much as wins.
 *  4. Once corpus has >= 25 weighted-positive signals, generate a new
 *     scoring prompt that bakes the patterns observed.
 *  5. Write the new prompt to lead_scoring_prompts. Flip is_active.
 *  6. Old prompt preserved for rollback.
 *
 * Cost: 1 Claude Sonnet call/night to regenerate prompt = ~$0.05/day.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const OUTCOME_WEIGHTS: Record<string, number> = {
  paid: 5.0,
  trial_started: 2.0,
  replied_interested: 1.0,
  positive_reply: 1.0,
  replied_objection: 0.2,
  bounced: -0.5,
  unsubscribed: -1.0,
  hostile: -2.0,
  wrong_person: -0.3,
}

const MIN_SIGNALS_FOR_LEARNING = 25

export async function runLearningCycle(): Promise<{
  signals_captured: number
  prompt_regenerated: boolean
  new_version?: string
  reason?: string
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // 1. Pull recently-converted/rejected leads not yet captured.
  // Use the existence of lead_scoring_signals as the "already captured" check.
  const { data: leads } = await supabase
    .from('outreach_leads')
    .select(`
      id, business_name, trade, trade_normalized,
      city, state, owner_phone, owner_first_name,
      review_count:buyer_score,
      buyer_score, score_reasoning, scored_at,
      status, paid_at, trial_started_at, text_response_at, text_response,
      website_snippet
    `)
    .or('paid_at.not.is.null,trial_started_at.not.is.null,status.in.(positive_reply,objection,bounced,unsubscribed)')
    .order('updated_at', { ascending: false })
    .limit(500)

  if (!leads || leads.length === 0) {
    return { signals_captured: 0, prompt_regenerated: false, reason: 'no recent outcomes' }
  }

  // Filter out already-captured (cheaper than join + LEFT NOT EXISTS)
  const ids = leads.map((l) => l.id)
  const { data: existing } = await supabase
    .from('lead_scoring_signals')
    .select('lead_id')
    .in('lead_id', ids)
  const existingSet = new Set((existing ?? []).map((e) => e.lead_id))
  const fresh = leads.filter((l) => !existingSet.has(l.id))

  let captured = 0
  for (const l of fresh) {
    const outcome = inferOutcome(l)
    const weight = OUTCOME_WEIGHTS[outcome] ?? 0
    if (weight === 0) continue

    const signals = {
      business_name: l.business_name,
      trade: l.trade_normalized ?? l.trade ?? 'HVAC',
      review_count: l.buyer_score, // legacy alias TODO clean
      buyer_score_at_send: l.buyer_score,
      score_reasoning_at_send: l.score_reasoning,
      website_snippet_present: !!l.website_snippet,
      first_text_response: (l.text_response || '').slice(0, 300),
    }

    await supabase.from('lead_scoring_signals').insert({
      lead_id: l.id,
      business_name: l.business_name,
      trade: l.trade_normalized ?? l.trade ?? 'HVAC',
      signals,
      outcome,
      weight,
    })
    captured++
  }

  // 2. Decide if we have enough corpus to retrain
  const { count: positiveCount } = await supabase
    .from('lead_scoring_signals')
    .select('id', { count: 'exact', head: true })
    .gte('weight', 1)
  const totalPositive = positiveCount ?? 0

  if (totalPositive < MIN_SIGNALS_FOR_LEARNING) {
    return {
      signals_captured: captured,
      prompt_regenerated: false,
      reason: `corpus too small: ${totalPositive} positive signals (need ${MIN_SIGNALS_FOR_LEARNING})`,
    }
  }

  // 3. Regenerate scoring prompt from corpus
  const { data: corpus } = await supabase
    .from('lead_scoring_signals')
    .select('trade, signals, outcome, weight')
    .order('weight', { ascending: false })
    .limit(200)

  const newPrompt = await regenerateScoringPrompt(corpus ?? [])
  const newVersion = `v${new Date().toISOString().slice(0, 10)}-learned`

  // Deactivate existing active prompt, insert + activate new one
  await supabase.from('lead_scoring_prompts').update({ is_active: false }).eq('is_active', true)
  await supabase.from('lead_scoring_prompts').insert({
    version: newVersion,
    prompt_text: newPrompt,
    generated_from_signal_count: totalPositive,
    notes: `Auto-regenerated. Positive corpus: ${totalPositive}`,
    is_active: true,
  })

  return { signals_captured: captured, prompt_regenerated: true, new_version: newVersion }
}

function inferOutcome(l: any): string {
  if (l.paid_at) return 'paid'
  if (l.trial_started_at) return 'trial_started'
  if (l.status === 'positive_reply') return 'replied_interested'
  if (l.status === 'objection') return 'replied_objection'
  if (l.status === 'bounced') return 'bounced'
  if (l.status === 'unsubscribed') return 'unsubscribed'
  if (l.status === 'wrong_person') return 'wrong_person'
  return 'unknown'
}

async function regenerateScoringPrompt(corpus: Array<{ trade: string; signals: any; outcome: string; weight: number }>): Promise<string> {
  const client = new Anthropic()
  const summary = JSON.stringify(corpus.slice(0, 100).map((c) => ({
    trade: c.trade,
    outcome: c.outcome,
    weight: c.weight,
    signals: c.signals,
  })))

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: `You are improving the scoring system for BellAveGo's predictive lead scorer. Below is a corpus of past prospects: their observed signals and their actual outcome (paid customer, bounced, ignored, etc.). Your job is to rewrite the scoring system prompt to better predict paid conversions.

The prompt you write will be the system prompt for Claude Haiku scoring future prospects 1-10.

Rules:
- Keep it under 1000 words
- Lead with the IDEAL buyer profile derived from "paid" outcomes
- Include observed NEGATIVE patterns from bounces/unsubscribes
- Return ONLY the new system prompt text. No preamble, no explanation.`,
    messages: [
      {
        role: 'user',
        content: `Past prospect corpus:\n\n${summary}\n\nWrite the new scoring system prompt.`,
      },
    ],
  })

  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()
}
