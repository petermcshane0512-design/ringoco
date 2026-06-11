import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { fireLeadEngineForUser } from '@/lib/leadEngine'
import { LEADS_PER_WEEK } from '@/lib/offer'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/leads/check-and-drop
 *
 * Fires when the dashboard countdown hits zero. If the tenant's
 * next_lead_drop_at has elapsed, runs assignLeadsForTenant immediately so
 * the user sees the new 5 leads in the same render — no waiting on the
 * hourly cron. If timer hasn't elapsed yet (clock skew, manual ping), we
 * return ok:false and the dashboard keeps counting down.
 *
 * Auth: Clerk session — same as /dashboard/leads.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('user_id, next_lead_drop_at, is_active')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !profile) {
    return NextResponse.json({ ok: false, reason: 'profile_not_found' }, { status: 404 })
  }
  if (!profile.is_active) {
    return NextResponse.json({ ok: false, reason: 'inactive' })
  }

  // Timer not yet elapsed — dashboard countdown is ahead of server clock.
  // Tell client to keep counting; do not fire a drop.
  //
  // 2026-06-11 EXCEPTION: a PARTIAL drop (supply ran short — e.g. BatchData
  // unfunded) leaves the tenant owed leads for the current week. If the
  // trailing-7d delivered count is below the weekly target, fire the engine
  // regardless of the timer so the pool tops up the moment supply returns.
  // The engine's own quota check caps the total — this can never over-drop.
  if (profile.next_lead_drop_at) {
    const next = new Date(profile.next_lead_drop_at).getTime()
    if (next > Date.now()) {
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const { count } = await supabase
        .from('lead_drops')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('drop_date', weekAgo)
      const owed = (count ?? 0) < LEADS_PER_WEEK
      if (!owed) {
        return NextResponse.json({
          ok: false,
          reason: 'not_yet_due',
          next_lead_drop_at: profile.next_lead_drop_at,
        })
      }
      console.log(`[check-and-drop] partial week (${count}/${LEADS_PER_WEEK}) — bypassing timer for ${userId}`)
    }
  }

  const result = await fireLeadEngineForUser(userId)
  return NextResponse.json({ ok: true, ...result })
}
