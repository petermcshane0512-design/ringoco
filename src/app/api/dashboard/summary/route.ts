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

  // Time windows for the AI Receptionist sidebar live metrics
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  // Start of THIS week (Monday) — typical for contractors who plan weekly
  const startOfWeek = new Date()
  startOfWeek.setHours(0, 0, 0, 0)
  const dayOfWeek = startOfWeek.getDay() // 0=Sun, 1=Mon, ... 6=Sat
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday)

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
    supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfToday.toISOString()),
    // Calls received this week (since Monday) — drives "BellAveGo Calls Answered This Week"
    supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfWeek.toISOString()),
    // Leads captured this month — drives the "Leads captured" sidebar metric.
    // A "lead" = a call_log row where the AI booked a job (booking_completed=true).
    // Falls back to total call_logs this month if the booking_completed column is empty.
    supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('booking_completed', true)
      .gte('created_at', startOfMonth.toISOString()),
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
