import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runMarketingOpsForCustomer } from '@/lib/marketing/agent'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Weekly cron — Monday 06:00 UTC. Runs the AI Marketing Ops Agent for every
 * active Concierge customer. One customer's failure does not abort the loop.
 *
 * Scheduled in vercel.json. Requires Vercel Pro for additional cron slot.
 */
export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization: Bearer ${CRON_SECRET} when configured.
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
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
