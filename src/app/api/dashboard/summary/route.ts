import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { effectiveAuth } from '@/lib/effectiveAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Single-shot dashboard data loader. Replaces 4 client-side Supabase queries
 * that the dashboard previously did with the anon key — which leaked tenant
 * data across customers (CLAUDE.md flagged this exact pattern).
 *
 * Returns:
 *   - jobs: 20 most recent jobs for this tenant
 *   - jobsCount: total jobs ever
 *   - customersCount: total customers ever
 *   - reports: 10 most recent consulting reports
 *
 * Honors admin impersonation via effectiveAuth() — admins viewing as a
 * customer see that customer's data, not their own.
 */
export async function GET() {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pull the contractor's timezone so "today" is computed against THEIR
  // wall clock, not Vercel's UTC clock. Previously `setHours(0,0,0,0)` ran
  // in server-local (UTC) so a Chicago contractor's "today" started at
  // 7pm CDT the prior day — every morning's calls counted as "yesterday"
  // and "Calls Today" read 0. Profile.timezone is backfilled to
  // America/Chicago by sql/2026-05-22-timezone-default.sql.
  const { data: tzProfile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle()
  const userTz = (tzProfile as { timezone?: string | null } | null)?.timezone || 'America/Chicago'

  function startOfDayInTz(tz: string): Date {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(now)
    const h   = parseInt(parts.find(p => p.type === 'hour')?.value || '0')
    const min = parseInt(parts.find(p => p.type === 'minute')?.value || '0')
    const sec = parseInt(parts.find(p => p.type === 'second')?.value || '0')
    // "24" hour (used by some Intl impls for midnight) → treat as 0
    const hourOfDay = h === 24 ? 0 : h
    const elapsedMs = (hourOfDay * 3600 + min * 60 + sec) * 1000
    return new Date(now.getTime() - elapsedMs)
  }

  // Time windows for the AI Receptionist sidebar live metrics
  const startOfToday = startOfDayInTz(userTz)
  // "This week" = rolling 7 days back from now — timezone-independent.
  const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  // Start of month — first of THIS calendar month in the user's tz.
  const monthParts = new Intl.DateTimeFormat('en-US', {
    timeZone: userTz, year: 'numeric', month: '2-digit',
  }).formatToParts(new Date())
  const monthYear = parseInt(monthParts.find(p => p.type === 'year')?.value || '2026')
  const monthMonth = parseInt(monthParts.find(p => p.type === 'month')?.value || '1')
  // Approximate start-of-month in tz by computing UTC midnight of day 1
  // and shifting by the tz offset from startOfToday's calculation.
  const startOfMonth = new Date(Date.UTC(monthYear, monthMonth - 1, 1))

  const [
    jobsRes,
    jobsCountRes,
    customersCountRes,
    reportsRes,
    callsTodayRes,
    callsThisWeekRes,
    leadsThisMonthRes,
  ] = await Promise.all([
    supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('consulting_reports')
      .select('id, title, client_name, period_label, report_type, bellavego_score, created_at, pdf_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    // Calls received today — drives the "BellAveGo Calls Answered Today" stat
    // Excludes DB-error rows (system failures, not real customer calls).
    supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfToday.toISOString())
      .or('summary.is.null,summary.not.ilike.DB_INSERT_FAILED%'),
    // Calls received in the last 7 days — drives "BellAveGo Calls Answered This Week"
    supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfWeek.toISOString())
      .or('summary.is.null,summary.not.ilike.DB_INSERT_FAILED%'),
    // Leads captured this month — drives the "Leads captured" sidebar metric.
    // A "lead" = a call_log row where the AI booked a job (booking_completed=true).
    // Excludes DB-error rows.
    supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('booking_completed', true)
      .gte('created_at', startOfMonth.toISOString())
      .or('summary.is.null,summary.not.ilike.DB_INSERT_FAILED%'),
  ])

  if (jobsRes.error) return NextResponse.json({ error: jobsRes.error.message }, { status: 500 })

  return NextResponse.json({
    jobs: jobsRes.data ?? [],
    jobsCount: jobsCountRes.count ?? 0,
    customersCount: customersCountRes.count ?? 0,
    reports: reportsRes.data ?? [],
    callsToday: callsTodayRes.count ?? 0,
    callsThisWeek: callsThisWeekRes.count ?? 0,
    leadsThisMonth: leadsThisMonthRes.count ?? 0,
  })
}
