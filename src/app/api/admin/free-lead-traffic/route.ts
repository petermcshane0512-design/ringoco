import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/admin/free-lead-traffic — diagnostic (2026-06-15). Answers "are we
 * UNDERCOUNTING clicks?" The board's click signal is prospect_free_leads
 * .visit_count, incremented only on a non-bot /free-lead POST. If the 2026-06-13
 * bot filter (require Mozilla UA) is too aggressive, real clicks get logged as
 * bot_clicks_blocked instead — so a high blocked count vs low visit count =
 * the filter is eating humans. Read-only, admin-gated.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const dayAgo = new Date(Date.now() - 86400000).toISOString()
  const twoDayAgo = new Date(Date.now() - 2 * 86400000).toISOString()

  const [visitedTotal, visited24h, blockedRows, recentVisits] = await Promise.all([
    supabase.from('prospect_free_leads').select('biz_id', { count: 'exact', head: true }).gt('visit_count', 0),
    supabase.from('prospect_free_leads').select('biz_id', { count: 'exact', head: true }).gte('last_visited_at', dayAgo),
    supabase.from('prospect_free_leads').select('biz_id, bot_clicks_blocked', { count: 'exact' }).gt('bot_clicks_blocked', 0).limit(1000),
    supabase.from('prospect_free_leads')
      .select('email, visit_count, last_visited_at, bot_clicks_blocked')
      .gte('last_visited_at', twoDayAgo)
      .order('last_visited_at', { ascending: false })
      .limit(50),
  ])

  const totalBlocked = ((blockedRows.data ?? []) as Array<{ bot_clicks_blocked: number | null }>)
    .reduce((s, r) => s + (r.bot_clicks_blocked ?? 0), 0)

  return NextResponse.json({
    visited_ever: visitedTotal.count ?? 0,
    visited_last_24h: visited24h.count ?? 0,
    rows_with_bot_blocks: blockedRows.count ?? 0,
    total_bot_clicks_blocked: totalBlocked,
    interpretation: (blockedRows.count ?? 0) > (visited24h.count ?? 0)
      ? '⚠️ blocked > human visits — bot filter may be eating real clicks'
      : 'blocked count low vs visits — filter looks OK',
    recent_visits: (recentVisits.data ?? []).map((r) => ({
      email: (r as { email: string }).email,
      visits: (r as { visit_count: number }).visit_count,
      last: (r as { last_visited_at: string }).last_visited_at,
      bot_blocked: (r as { bot_clicks_blocked: number | null }).bot_clicks_blocked ?? 0,
    })),
  })
}
