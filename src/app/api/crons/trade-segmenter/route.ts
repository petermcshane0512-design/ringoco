import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/trade-segmenter
 *
 * Daily 9pm CT. Answers "which trade likes the offer most?" Surfaces
 * signal only — does NOT auto-shift targeting. After 14 days of data
 * Peter decides whether to bias future scrapes toward winners.
 *
 * Reads outreach_leads filtered to today's send window, computes per-
 * trade open/reply/click rates, persists to outreach_trade_segments.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'

const TRADES = ['HVAC', 'Plumbing', 'Electrical', 'Roofing', 'Handyman']

function normalizeTrade(t: string | null): string | null {
  if (!t) return null
  const lower = t.toLowerCase()
  if (/hvac|heating|air condition|cooling/.test(lower)) return 'HVAC'
  if (/plumb/.test(lower)) return 'Plumbing'
  if (/electric/.test(lower)) return 'Electrical'
  if (/roof/.test(lower)) return 'Roofing'
  if (/handy|general/.test(lower)) return 'Handyman'
  return null
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)

  // Pull all leads that have been pushed at least once
  const { data: leads } = await supabase
    .from('outreach_leads')
    .select('id, trade, first_opened_at, open_count, report_visit_at, text_response_at, demo_booked_at, pushed_at')
    .not('pushed_at', 'is', null)

  type Row = { trade: string; sent: number; opens: number; replies: number; clicks: number }
  const byTrade = new Map<string, Row>()
  for (const t of TRADES) byTrade.set(t, { trade: t, sent: 0, opens: 0, replies: 0, clicks: 0 })

  for (const l of leads || []) {
    const trade = normalizeTrade(l.trade)
    if (!trade) continue
    const row = byTrade.get(trade)!
    row.sent++
    if (l.first_opened_at) row.opens++
    if (l.report_visit_at) row.clicks++
    if (l.text_response_at || l.demo_booked_at) row.replies++
  }

  const results: Array<{ trade: string; sent: number; open_rate: number; reply_rate: number; click_rate: number }> = []
  for (const row of byTrade.values()) {
    const openRate = row.sent > 0 ? row.opens / row.sent : 0
    const replyRate = row.sent > 0 ? row.replies / row.sent : 0
    const clickRate = row.sent > 0 ? row.clicks / row.sent : 0
    const persist = {
      campaign_id: CAMPAIGN_ID,
      trade: row.trade,
      date: today,
      sent: row.sent,
      opens: row.opens,
      replies: row.replies,
      positive_replies: 0,
      clicks: row.clicks,
      open_rate: openRate,
      reply_rate: replyRate,
      click_rate: clickRate,
    }
    await supabase.from('outreach_trade_segments').upsert(persist, { onConflict: 'campaign_id,trade,date' })
    results.push({ trade: row.trade, sent: row.sent, open_rate: openRate, reply_rate: replyRate, click_rate: clickRate })
  }

  // Rank winners + losers (surface only)
  const ranked = results
    .filter((r) => r.sent >= 20)
    .sort((a, b) => b.reply_rate - a.reply_rate)

  const insights: string[] = []
  if (ranked.length >= 2) {
    const winner = ranked[0]
    const loser = ranked[ranked.length - 1]
    if (winner.reply_rate > 2 * loser.reply_rate) {
      insights.push(`🏆 ${winner.trade} reply ${(winner.reply_rate * 100).toFixed(2)}% vs ${loser.trade} ${(loser.reply_rate * 100).toFixed(2)}% — ${winner.trade} is 2x+ winner`)
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    by_trade: results,
    insights,
    checked_at: new Date().toISOString(),
  })
}
