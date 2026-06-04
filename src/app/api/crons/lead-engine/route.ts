import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TIER_FEATURES, isValidTier, type Tier } from '@/lib/pricing'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/lead-engine
 *
 * Runs daily at 4am CST. Assigns fresh leads from the `leads` master pool to
 * each tenant according to their tier's cadence:
 *   Starter → 5 leads/quarter
 *   Pro     → 15 leads/month
 *   Elite   → 25 leads/week
 *
 * Skips tenants who already hit their quota for the current period.
 *
 * Phase 1 (TODAY): assigns from existing `leads` pool. Ingestion of leads
 *   from BatchData / NOAA / city permits is Phase 2 — separate cron.
 *
 * Auth: x-vercel-cron OR x-admin-secret.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// How many leads each tier should receive in their current period
// (quarter / month / week). Source of truth: TIER_FEATURES.leadsPerYear.
const TIER_DROP_TARGET: Record<Tier, { period: 'quarterly' | 'monthly' | 'weekly'; perDrop: number }> = {
  receptionist: { period: 'quarterly', perDrop: 5 },   // 5 every quarter
  officemgr:    { period: 'monthly',   perDrop: 15 },  // 15 every month
  concierge:    { period: 'weekly',    perDrop: 25 },  // 25 every week
}

type ProfileRow = {
  user_id: string
  plan_tier: string | null
  service_area: string | null
  business_type: string | null
  is_active: boolean | null
}

async function assignLeadsForTenant(profile: ProfileRow): Promise<{ assigned: number; skipped_reason?: string }> {
  if (!profile.is_active) return { assigned: 0, skipped_reason: 'inactive' }
  if (!isValidTier(profile.plan_tier || '')) return { assigned: 0, skipped_reason: 'unknown_tier' }
  const tier = profile.plan_tier as Tier
  const cadence = TIER_DROP_TARGET[tier]

  // Check current period quota
  const { data: quotaRow } = await supabase
    .from('tenant_lead_quota_usage')
    .select('*')
    .eq('user_id', profile.user_id)
    .maybeSingle()

  const used =
    cadence.period === 'weekly'
      ? quotaRow?.leads_this_week ?? 0
      : cadence.period === 'monthly'
      ? quotaRow?.leads_this_month ?? 0
      : quotaRow?.leads_this_quarter ?? 0

  const remaining = cadence.perDrop - used
  if (remaining <= 0) return { assigned: 0, skipped_reason: 'quota_filled' }

  // Pull top-scored unassigned leads matching tenant's trade + service area.
  // service_area for HVAC contractors typically holds a city/region string;
  // for now we match by trade (broader) and rank by score. ZIP-based geo
  // filtering is added in a follow-up cron (uses profile.serviceZips).
  const tradeFilter = (profile.business_type || 'hvac').toLowerCase()
  const { data: candidates } = await supabase
    .from('leads')
    .select('id, lead_score, source, trade_match, zip, street_address')
    .contains('trade_match', [tradeFilter])
    .order('lead_score', { ascending: false })
    .limit(remaining * 3) // pull buffer in case some are already assigned to this tenant

  if (!candidates || candidates.length === 0) {
    return { assigned: 0, skipped_reason: 'no_candidates' }
  }

  // Filter out leads this tenant already received
  const { data: already } = await supabase
    .from('lead_drops')
    .select('lead_id')
    .eq('user_id', profile.user_id)
    .in('lead_id', candidates.map((c) => c.id))
  const alreadySet = new Set((already || []).map((r) => r.lead_id))
  const fresh = candidates.filter((c) => !alreadySet.has(c.id)).slice(0, remaining)

  if (fresh.length === 0) return { assigned: 0, skipped_reason: 'all_already_received' }

  // Insert drops
  const dropRows = fresh.map((c) => ({
    user_id: profile.user_id,
    profile_id: profile.user_id,
    lead_id: c.id,
    drop_period: cadence.period,
    status: 'new' as const,
  }))
  const { error: insertErr } = await supabase.from('lead_drops').insert(dropRows)
  if (insertErr) {
    console.warn(`[lead-engine] insert err for ${profile.user_id}: ${insertErr.message}`)
    return { assigned: 0, skipped_reason: 'insert_failed' }
  }

  return { assigned: fresh.length }
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Pull all active tenants on a real tier (skip demo/legacy)
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, plan_tier, service_area, business_type, is_active')
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
    skipped: { quota_filled: 0, no_candidates: 0, all_already_received: 0, insert_failed: 0, inactive: 0, unknown_tier: 0 },
    per_tenant: [] as Array<{ user_id: string; tier: string; assigned: number; reason?: string }>,
  }

  for (const p of profiles as ProfileRow[]) {
    const res = await assignLeadsForTenant(p)
    if (res.assigned > 0) {
      results.assigned_count += res.assigned
    }
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
