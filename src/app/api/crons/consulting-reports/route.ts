import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reportDue } from '@/lib/reportCadence'
import { generateAndDeliverReport, type RunnerProfile } from '@/lib/consultingReportRunner'

export const maxDuration = 300 // 5 min — PDF rendering + Claude per customer is slow

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Daily cron — picks active customers whose tier cadence is due for a consulting
 * report (welcome on day 1, then periodic at Receptionist = 6/yr, Office Manager =
 * 12/yr, Concierge = 4/yr quarterly deep-dive only; Concierge weekly handled by
 * marketing-ops-weekly cron). Cadences defined in src/lib/reportCadence.ts.
 *
 * Cap of 50 reports per run protects against burst spend on Claude/Twilio/Storage
 * AND keeps each invocation comfortably inside maxDuration=300s (at ~3-5s per report
 * dominated by the Claude call). Cron runs every 6h (vercel.json), so daily throughput
 * is 4 × 50 = 200 reports/day — enough headroom for ~1,000 active customers blended
 * across Receptionist (6/yr), Office-Mgr (12/yr), and Concierge (bi-weekly + quarterly).
 * Leftover work rolls to the next 6h run.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(
      'user_id, business_name, business_type, owner_phone, owner_first_name, ' +
      'twilio_number, service_area, zip_code, google_place_id, plan_tier, is_active, ' +
      'welcome_report_at, last_consulting_report_at',
    )
    .eq('is_active', true)
    .not('plan_tier', 'is', null)
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const now = new Date()
  const dueList: { profile: RunnerProfile; type: 'welcome' | 'periodic' }[] = []

  for (const p of (profiles ?? []) as unknown as RunnerProfile[]) {
    const due = reportDue({
      planTier: p.plan_tier,
      isActive: p.is_active,
      welcomeReportAt: p.welcome_report_at,
      lastConsultingReportAt: p.last_consulting_report_at,
      now,
    })
    if (due) dueList.push({ profile: p, type: due })
  }

  // Cap per-run burst — 50/run × 4 runs/day = 200/day, sized for ~1,000 customers.
  const BURST_CAP = 50
  const work = dueList.slice(0, BURST_CAP)

  const results: Awaited<ReturnType<typeof generateAndDeliverReport>>[] = []
  for (const job of work) {
    try {
      const r = await generateAndDeliverReport(job.profile, job.type)
      results.push(r)
    } catch (e) {
      results.push({ user_id: job.profile.user_id, status: 'error', reason: (e as Error).message })
    }
  }

  const summary = {
    candidates: dueList.length,
    attempted: work.length,
    generated: results.filter((r) => r.status === 'generated').length,
    errors: results.filter((r) => r.status === 'error').length,
    deferred: Math.max(0, dueList.length - work.length),
  }

  await supabase.from('agent_runs').insert({
    agent: 'consulting-reports',
    leads_pushed: summary.generated,
    notes: JSON.stringify({ summary, results }),
  })

  return NextResponse.json({ ok: true, ...summary, results })
}
