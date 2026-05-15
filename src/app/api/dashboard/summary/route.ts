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

  const [jobsRes, jobsCountRes, customersCountRes, reportsRes] = await Promise.all([
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
  ])

  if (jobsRes.error) return NextResponse.json({ error: jobsRes.error.message }, { status: 500 })

  return NextResponse.json({
    jobs: jobsRes.data ?? [],
    jobsCount: jobsCountRes.count ?? 0,
    customersCount: customersCountRes.count ?? 0,
    reports: reportsRes.data ?? [],
  })
}
