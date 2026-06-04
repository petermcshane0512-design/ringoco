import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { assignLeadsForTenant, type ProfileRow } from '@/lib/leadEngine'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/lead-engine
 *
 * Daily 4am CST. Iterates every active tenant, runs assignLeadsForTenant.
 * Tier cadence enforced inside the shared lib.
 *
 * For on-signup day-1 backfill, see fireLeadEngineForUser() in
 * src/lib/leadEngine.ts — called directly from Stripe webhook.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, plan_tier, service_area, service_zips, service_radius_mi, business_type, is_active')
    .eq('is_active', true)
    .in('plan_tier', ['receptionist', 'officemgr', 'concierge'])
    .not('twilio_number', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, message: 'no eligible tenants' })
  }

  const results = {
    total_tenants: profiles.length,
    assigned_count: 0,
    skipped: { quota_filled: 0, no_candidates: 0, all_already_received: 0, insert_failed: 0, inactive: 0, unknown_tier: 0, no_service_zips: 0 },
    per_tenant: [] as Array<{ user_id: string; tier: string; assigned: number; reason?: string }>,
  }

  for (const p of profiles as ProfileRow[]) {
    const res = await assignLeadsForTenant(p)
    if (res.assigned > 0) results.assigned_count += res.assigned
    if (res.skipped_reason) {
      const key = res.skipped_reason as keyof typeof results.skipped
      if (key in results.skipped) results.skipped[key]++
    }
    results.per_tenant.push({
      user_id: p.user_id,
      tier: p.plan_tier || 'unknown',
      assigned: res.assigned,
      reason: res.skipped_reason,
    })
  }

  return NextResponse.json({
    ok: true,
    checked_at: new Date().toISOString(),
    ...results,
  })
}
