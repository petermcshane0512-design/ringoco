import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { restoreFromCapacityMode } from '@/lib/provisionNumber'

/**
 * Reset monthly call caps — restore all contractors who are in
 * capacity mode back to normal mode.
 *
 * Runs at 00:05 UTC on the 1st of each month (per vercel.json).
 *
 * Why 00:05 and not 00:00: gives Stripe/Vapi a 5-min window to settle
 * any in-flight calls before we PATCH assistants.
 *
 * Mechanism:
 *   1. SELECT profiles WHERE capacity_mode_at IS NOT NULL
 *   2. For each, call restoreFromCapacityMode(user_id) which:
 *      - Re-PATCHes the Vapi assistant with renderSystemPrompt(tenant)
 *      - Clears profiles.capacity_mode_at
 *   3. Log + return summary
 *
 * Auth: CRON_SECRET header (Vercel's standard cron auth). Manual GET
 * visits without the header are still allowed during dev so Peter
 * can hit /api/crons/reset-monthly-caps in a browser to test.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  // Auth: when CRON_SECRET is set and the request carries auth, verify it.
  // Vercel's cron sender includes Authorization: Bearer <CRON_SECRET>.
  // No header = allowed (dev/manual testing).
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: capped, error } = await supabase
    .from('profiles')
    .select('user_id, business_name, capacity_mode_at')
    .not('capacity_mode_at', 'is', null)

  if (error) {
    console.error('[reset-monthly-caps] select failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (capped || []) as unknown as Array<{
    user_id: string
    business_name: string | null
    capacity_mode_at: string
  }>

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, restored: 0, note: 'no profiles in capacity mode' })
  }

  console.log(`[reset-monthly-caps] restoring ${rows.length} profiles from capacity mode`)

  const results: Array<{ user_id: string; business_name: string | null; ok: boolean; reason?: string }> = []
  for (const row of rows) {
    const r = await restoreFromCapacityMode(row.user_id)
    results.push({
      user_id: row.user_id,
      business_name: row.business_name,
      ok: r.ok,
      reason: r.ok ? undefined : r.reason,
    })
  }

  const succeeded = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length

  return NextResponse.json({
    ok: true,
    total: rows.length,
    restored: succeeded,
    failed,
    failures: results.filter((r) => !r.ok),
  })
}
