import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Diagnose dashboard call counts. Returns every call_logs row for a
 * user_id over the past 8 days, with the actual vs expected counts so
 * we can see if dupes or wrong-day rows are inflating/deflating the
 * displayed numbers.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const userId = new URL(req.url).searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'missing user_id' }, { status: 400 })

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  // dashboard's current "week" calc — Monday 0:00 of current week
  const startOfWeekMonday = new Date()
  startOfWeekMonday.setHours(0, 0, 0, 0)
  const dow = startOfWeekMonday.getDay() // 0=Sun, 1=Mon, ... 6=Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1
  startOfWeekMonday.setDate(startOfWeekMonday.getDate() - daysSinceMonday)
  // alternative: rolling 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)

  const { data: rows } = await supabase
    .from('call_logs')
    .select('id, call_sid, caller_phone, created_at, job_created, booking_completed, summary')
    .eq('user_id', userId)
    .gte('created_at', eightDaysAgo.toISOString())
    .order('created_at', { ascending: false })

  const r = rows ?? []
  const todayRows = r.filter((x) => new Date(x.created_at) >= startOfToday)
  const mondayRows = r.filter((x) => new Date(x.created_at) >= startOfWeekMonday)
  const rolling7Rows = r.filter((x) => new Date(x.created_at) >= sevenDaysAgo)

  // Group by call_sid to find duplicates
  const bySid = new Map<string, number>()
  for (const x of r) bySid.set(x.call_sid, (bySid.get(x.call_sid) ?? 0) + 1)
  const duplicateSids = [...bySid.entries()].filter(([, count]) => count > 1)

  return NextResponse.json({
    user_id: userId,
    nowCT: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
    counts: {
      today_dashboard_says: todayRows.length,
      week_dashboard_says_monday_start: mondayRows.length,
      week_rolling_7d: rolling7Rows.length,
      total_in_8d_window: r.length,
    },
    startOfWeekMondayUsedByDashboard: startOfWeekMonday.toISOString(),
    duplicate_call_sids: duplicateSids,
    rows: r.map((x) => ({
      sid: x.call_sid?.slice(0, 16),
      caller: x.caller_phone,
      created_at: x.created_at,
      job_created: x.job_created,
      summary_preview: x.summary?.slice(0, 80),
    })),
  })
}
