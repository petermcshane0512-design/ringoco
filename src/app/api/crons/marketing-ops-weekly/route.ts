import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runMarketingOpsForCustomer } from '@/lib/marketing/agent'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Bi-weekly cron — fires every Monday 06:00 UTC but only runs the Marketing
 * Ops Agent on EVEN ISO weeks. Net cadence: 26 reports/yr per Concierge
 * customer (was 52/yr — reduced May 2026 per Peter, see CLAUDE.md pricing v7).
 *
 * One customer's failure does not abort the loop.
 * Scheduled in vercel.json.
 *
 * Override: pass ?force=1 (admin only) to ignore the week-parity gate.
 */
function isoWeekNumber(d: Date): number {
  // Thursday-aligned ISO 8601 week number
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization: Bearer ${CRON_SECRET} when configured.
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Bi-weekly gate: run only on even ISO weeks unless ?force=1
  const url = new URL(req.url)
  const force = url.searchParams.get('force') === '1'
  const week = isoWeekNumber(new Date())
  if (!force && week % 2 !== 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `ISO week ${week} is odd — bi-weekly cron only fires on even weeks`,
    })
  }

  // Fetch all active Concierge customers
  const { data: customers, error } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('is_active', true)
    .eq('plan_tier', 'concierge')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{ userId: string; ok: boolean; stepsSummary: string; reportUrl?: string }> = []
  for (const c of customers ?? []) {
    const userId = (c as { user_id: string }).user_id
    try {
      const r = await runMarketingOpsForCustomer({ supabase, userId })
      const okSteps = Object.entries(r.steps).filter(([, v]) => v.ok).length
      const totalSteps = Object.keys(r.steps).length
      results.push({
        userId,
        ok: okSteps === totalSteps,
        stepsSummary: `${okSteps}/${totalSteps} steps ok`,
        reportUrl: r.reportUrl,
      })
    } catch (e) {
      results.push({
        userId,
        ok: false,
        stepsSummary: `agent threw: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  // Log the run
  await supabase.from('agent_runs').insert({
    agent: 'marketing-ops-weekly',
    notes: JSON.stringify({ customersProcessed: results.length, results }),
  })

  return NextResponse.json({ ok: true, customersProcessed: results.length, results })
}
