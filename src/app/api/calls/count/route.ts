import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { callCapForTier } from '@/lib/pricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * GET /api/calls/count
 *
 * Returns this month's inbound call usage for the signed-in contractor +
 * their tier cap. Powers the "59 of 60 calls left this month" counter on
 * the dashboard. Cap = Infinity for unlimited tiers (Elite, legacy) — the
 * UI renders those as the count-up form ("23 calls this month") without a
 * remaining number.
 *
 * Counts call_logs rows since the 1st of the current calendar month in the
 * contractor's timezone (defaults to America/Chicago when unset). Matches
 * the enforcement logic in enforceCapIfCrossed so the displayed number is
 * the same one that triggers capacity-mode.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Pull tier + timezone in one query.
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_tier, timezone')
    .eq('user_id', userId)
    .maybeSingle()
  const planTier = (profile as { plan_tier?: string | null } | null)?.plan_tier ?? 'receptionist'
  const tz =
    typeof (profile as { timezone?: string } | null)?.timezone === 'string' && (profile as { timezone?: string }).timezone
      ? (profile as { timezone?: string }).timezone!
      : 'America/Chicago'

  // Start of the current calendar month in the contractor's tz.
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric',
  })
  const parts = fmt.formatToParts(now)
  const year = Number(parts.find(p => p.type === 'year')?.value)
  const month = Number(parts.find(p => p.type === 'month')?.value) - 1
  // First of month in UTC anchor — close enough for billing-month counting.
  const startIso = new Date(Date.UTC(year, month, 1, 0, 0, 0)).toISOString()

  const { count, error } = await supabase
    .from('call_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startIso)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const used = count ?? 0
  const cap = callCapForTier(planTier)
  const unlimited = !Number.isFinite(cap)
  const remaining = unlimited ? null : Math.max(0, cap - used)

  return NextResponse.json({
    used,
    cap: unlimited ? null : cap,
    remaining,
    unlimited,
    plan_tier: planTier,
    month_start: startIso,
  })
}
