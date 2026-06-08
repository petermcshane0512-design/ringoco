import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/variant-scorer
 *
 * Daily 8pm CT. Reads Instantly v2 lead activity for every live variant,
 * computes Bayesian Beta(α=opens+1, β=non-opens+1) posterior, persists
 * daily snapshot to outreach_variant_scores. After day 14 + ≥100 sends
 * per variant + 95% CI separation: auto-promote winner / kill loser.
 *
 * Until day 14: scores collected but no auto-actions (Algorithm Step 5).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2'

const DATA_CONFIDENCE_DAY = new Date('2026-06-22')  // day 14 from 2026-06-08

type Variant = {
  id: string
  variant_slug: string
  status: string
  step: number
}

// Beta posterior approx — α/(α+β) is the mean. 95% CI via Wilson interval
// (sufficient for our sample sizes, avoids needing a real Beta inverse-CDF).
function wilsonCI(success: number, total: number): { mean: number; lo: number; hi: number } {
  if (total <= 0) return { mean: 0, lo: 0, hi: 0 }
  const z = 1.96
  const p = success / total
  const denom = 1 + (z * z) / total
  const center = (p + (z * z) / (2 * total)) / denom
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denom
  return { mean: p, lo: Math.max(0, center - margin), hi: Math.min(1, center + margin) }
}

async function fetchPerVariantMetrics(variantId: string): Promise<{ sent: number; opens: number; replies: number; clicks: number }> {
  // Find leads assigned to this variant
  const { data: assignments } = await supabase
    .from('outreach_variant_assignments')
    .select('outreach_lead_id')
    .eq('variant_id', variantId)
  if (!assignments || assignments.length === 0) return { sent: 0, opens: 0, replies: 0, clicks: 0 }

  const leadIds = assignments.map((a) => a.outreach_lead_id)
  // For now we approximate metrics from outreach_leads counters. (Real
  // step-level Instantly attribution joins TBD.)
  const { data: leadStats } = await supabase
    .from('outreach_leads')
    .select('id, first_opened_at, open_count, report_visit_at, text_response_at, demo_booked_at')
    .in('id', leadIds)
  const sent = leadIds.length
  const opens = (leadStats || []).filter((l) => l.first_opened_at).length
  const clicks = (leadStats || []).filter((l) => l.report_visit_at).length
  const replies = (leadStats || []).filter((l) => l.text_response_at || l.demo_booked_at).length
  return { sent, opens, replies, clicks }
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data: variants } = await supabase
    .from('outreach_variants')
    .select('id, variant_slug, status, step')
    .eq('campaign_id', CAMPAIGN_ID)
    .in('status', ['live', 'draft'])

  const results: Array<{ variant_slug: string; sent: number; open_rate: number; reply_rate: number; click_rate: number; posterior_mean: number; lo95: number; hi95: number }> = []
  for (const v of (variants || []) as Variant[]) {
    const m = await fetchPerVariantMetrics(v.id)
    const openCI = wilsonCI(m.opens, m.sent)
    const replyRate = m.sent > 0 ? m.replies / m.sent : 0
    const clickRate = m.sent > 0 ? m.clicks / m.sent : 0
    const row = {
      variant_id: v.id,
      date: today,
      sent: m.sent,
      opens: m.opens,
      replies: m.replies,
      positive_replies: 0,  // populated by hot-reply classifier
      clicks: m.clicks,
      signups: 0,           // populated when stripe-attribution joins
      open_rate: openCI.mean,
      reply_rate: replyRate,
      click_rate: clickRate,
      signup_rate: 0,
      posterior_mean: openCI.mean,
      posterior_lo95: openCI.lo,
      posterior_hi95: openCI.hi,
    }
    await supabase.from('outreach_variant_scores').upsert(row, { onConflict: 'variant_id,date' })
    results.push({ variant_slug: v.variant_slug, sent: m.sent, open_rate: openCI.mean, reply_rate: replyRate, click_rate: clickRate, posterior_mean: openCI.mean, lo95: openCI.lo, hi95: openCI.hi })
  }

  // Auto-promote / kill ONLY if past data-confidence day AND ≥100 sends per variant
  const pastConfidence = new Date() >= DATA_CONFIDENCE_DAY
  const autoActions: string[] = []
  if (pastConfidence) {
    // Find variants with ≥100 sends + non-overlapping 95% CIs
    const ranked = results.filter((r) => r.sent >= 100).sort((a, b) => b.posterior_mean - a.posterior_mean)
    if (ranked.length >= 2) {
      const winner = ranked[0]
      const loser = ranked[ranked.length - 1]
      // Non-overlapping: winner.lo95 > loser.hi95
      if (winner.lo95 > loser.hi95) {
        autoActions.push(`PROMOTE ${winner.variant_slug} (mean=${winner.posterior_mean.toFixed(3)})`)
        autoActions.push(`KILL ${loser.variant_slug} (mean=${loser.posterior_mean.toFixed(3)})`)
        // Apply (auto-action gated on confidence day)
        await supabase.from('outreach_variants')
          .update({ status: 'winner', promoted_at: new Date().toISOString() })
          .eq('variant_slug', winner.variant_slug)
          .eq('campaign_id', CAMPAIGN_ID)
        await supabase.from('outreach_variants')
          .update({ status: 'loser', killed_at: new Date().toISOString() })
          .eq('variant_slug', loser.variant_slug)
          .eq('campaign_id', CAMPAIGN_ID)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    past_confidence: pastConfidence,
    results,
    auto_actions: autoActions,
    checked_at: new Date().toISOString(),
  })
}
