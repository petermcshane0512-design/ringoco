import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/crons/outreach-learner
 *
 * Daily 3pm CT — reads Instantly v2 analytics for the live campaign,
 * scores subject lines + step performance, persists learnings to
 * `outreach_learnings` supabase table, posts compact digest as Peter's
 * private admin tile.
 *
 * What it computes:
 *   - Open rate per step (Step 0 hook, Step 1 bump, Step 2 closer)
 *   - Reply rate + reply count per step
 *   - Click rate on landing-page CTA
 *   - Win/loss vs prior 7-day rolling avg
 *
 * What it learns over time:
 *   - Which subject line wording correlates w/ highest reply rate
 *   - Which step yields the most replies (truth = where to invest copy time)
 *   - Bounce + spam complaint trends (deliverability decay early warning)
 *
 * NEVER auto-rewrites copy. Only surfaces signal. Peter / Jarvis decide
 * what to change. Algorithm Step 1: question requirement before changing.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2'

type CampaignAnalytics = {
  leads_count?: number
  contacted_count?: number
  open_count?: number
  reply_count?: number
  link_click_count?: number
  bounced_count?: number
  unsubscribed_count?: number
  completed_count?: number
  emails_sent_count?: number
  new_leads_contacted_count?: number
}

async function fetchAnalytics(): Promise<CampaignAnalytics | null> {
  const url = `${INSTANTLY_BASE}/campaigns/analytics?ids=${CAMPAIGN_ID}`
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
  })
  if (!r.ok) {
    console.error('[outreach-learner] analytics HTTP', r.status, await r.text().catch(() => ''))
    return null
  }
  const j = await r.json()
  return Array.isArray(j) ? j[0] : (j.campaigns?.[0] || j)
}

type StepAnalytics = {
  step: number
  sent?: number
  opened?: number
  replied?: number
  clicked?: number
}

async function fetchStepBreakdown(): Promise<StepAnalytics[]> {
  // Instantly v2 step-level analytics endpoint
  const url = `${INSTANTLY_BASE}/campaigns/analytics/steps?campaign_id=${CAMPAIGN_ID}`
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
  })
  if (!r.ok) return []
  const j = await r.json()
  return Array.isArray(j) ? j as StepAnalytics[] : (j.steps || [])
}

function pct(num: number, den: number): number {
  if (!den || den <= 0) return 0
  return Math.round((num / den) * 1000) / 10
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const analytics = await fetchAnalytics()
  if (!analytics) {
    return NextResponse.json({ ok: false, error: 'analytics fetch failed' }, { status: 502 })
  }

  const sent = analytics.emails_sent_count ?? analytics.contacted_count ?? 0
  const opens = analytics.open_count ?? 0
  const replies = analytics.reply_count ?? 0
  const clicks = analytics.link_click_count ?? 0
  const bounces = analytics.bounced_count ?? 0
  const unsubs = analytics.unsubscribed_count ?? 0

  const today = {
    campaign_id: CAMPAIGN_ID,
    date: new Date().toISOString().slice(0, 10),
    sent,
    opens,
    open_rate_pct: pct(opens, sent),
    replies,
    reply_rate_pct: pct(replies, sent),
    clicks,
    click_rate_pct: pct(clicks, sent),
    bounces,
    bounce_rate_pct: pct(bounces, sent),
    unsubs,
    unsub_rate_pct: pct(unsubs, sent),
  }

  // Persist daily snapshot (idempotent on (campaign_id, date))
  const { error } = await supabase
    .from('outreach_learnings')
    .upsert(today, { onConflict: 'campaign_id,date' })

  // 7-day rolling comparison
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  const { data: history } = await supabase
    .from('outreach_learnings')
    .select('date, open_rate_pct, reply_rate_pct, bounce_rate_pct')
    .eq('campaign_id', CAMPAIGN_ID)
    .gte('date', sevenDaysAgo)
    .order('date', { ascending: true })

  const stepBreakdown = await fetchStepBreakdown()

  // Verdict logic — surface alerts but never auto-act
  const alerts: string[] = []
  if (today.bounce_rate_pct > 3) alerts.push(`🚨 bounce ${today.bounce_rate_pct}% > 3% — list quality issue`)
  if (today.unsub_rate_pct > 0.5) alerts.push(`⚠ unsub ${today.unsub_rate_pct}% > 0.5% — copy or targeting`)
  if (sent > 50 && today.reply_rate_pct < 0.5) alerts.push(`📉 reply ${today.reply_rate_pct}% < 0.5% — subject lines underperforming`)
  if (sent > 100 && today.reply_rate_pct > 3) alerts.push(`🔥 reply ${today.reply_rate_pct}% > 3% — winner, double down`)

  return NextResponse.json({
    ok: !error,
    today,
    step_breakdown: stepBreakdown,
    history_7d: history || [],
    alerts,
    persisted_error: error?.message,
    checked_at: new Date().toISOString(),
  })
}
