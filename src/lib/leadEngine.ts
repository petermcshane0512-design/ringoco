import { createClient } from '@supabase/supabase-js'
import { isValidTier, type Tier } from '@/lib/pricing'

/**
 * Lead-engine core. Used by:
 *   - /api/crons/lead-engine — runs daily for all active tenants
 *   - /api/stripe/webhook    — fires immediately on new signup
 *   - /api/leads/seed-tenant — admin-triggered backfill for one tenant
 *
 * Why share: the day-1-leads-on-signup play needs the same logic as the
 * daily cron. Duplicating would drift fast (Pro/Elite cadence, ZIP radius
 * expansion, dedup against prior drops). One source of truth.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export const TIER_DROP_TARGET: Record<Tier, { period: 'quarterly' | 'monthly' | 'weekly'; perDrop: number }> = {
  receptionist: { period: 'quarterly', perDrop: 5 },
  officemgr:    { period: 'monthly',   perDrop: 15 },
  concierge:    { period: 'weekly',    perDrop: 25 },
}

const VALID_TRADES = ['hvac', 'plumbing', 'electrical', 'roofing', 'handyman'] as const
type Trade = (typeof VALID_TRADES)[number]

export function normalizeTrade(raw: string | null | undefined): Trade {
  const t = (raw || '').toLowerCase().trim()
  if (t.includes('plumb')) return 'plumbing'
  if (t.includes('elect')) return 'electrical'
  if (t.includes('roof')) return 'roofing'
  if (t.includes('handy')) return 'handyman'
  return 'hvac'
}

export type ProfileRow = {
  user_id: string
  plan_tier: string | null
  service_area: string | null
  service_zips: string[] | null
  service_radius_mi: number | null
  business_type: string | null
  is_active: boolean | null
}

export type AssignResult = { assigned: number; skipped_reason?: string }

export async function assignLeadsForTenant(profile: ProfileRow): Promise<AssignResult> {
  if (!profile.is_active) return { assigned: 0, skipped_reason: 'inactive' }
  if (!isValidTier(profile.plan_tier || '')) return { assigned: 0, skipped_reason: 'unknown_tier' }
  const tier = profile.plan_tier as Tier
  const cadence = TIER_DROP_TARGET[tier]

  // Current-period quota check
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

  const tradeFilter = normalizeTrade(profile.business_type)
  const homeZips = (profile.service_zips || []).filter(Boolean)
  if (homeZips.length === 0) return { assigned: 0, skipped_reason: 'no_service_zips' }

  const radius = Math.max(1, Math.min(150, profile.service_radius_mi ?? 25))

  // Expand home ZIPs to full radius coverage
  const expanded = new Set<string>(homeZips)
  for (const hz of homeZips) {
    const { data: nearby } = await supabase.rpc('zips_within_miles', {
      primary_zip: hz,
      radius_mi: radius,
    })
    if (Array.isArray(nearby)) {
      for (const r of nearby) {
        if (r?.zip) expanded.add(r.zip)
      }
    }
  }
  const eligibleZips = [...expanded]
  if (eligibleZips.length === 0) return { assigned: 0, skipped_reason: 'no_service_zips' }

  const { data: candidates } = await supabase
    .from('leads')
    .select('id, lead_score, source, trade_match, zip, street_address')
    .contains('trade_match', [tradeFilter])
    .in('zip', eligibleZips)
    .order('lead_score', { ascending: false })
    .limit(remaining * 3)

  if (!candidates || candidates.length === 0) {
    return { assigned: 0, skipped_reason: 'no_candidates' }
  }

  const { data: already } = await supabase
    .from('lead_drops')
    .select('lead_id')
    .eq('user_id', profile.user_id)
    .in('lead_id', candidates.map((c) => c.id))
  const alreadySet = new Set((already || []).map((r) => r.lead_id))
  const fresh = candidates.filter((c) => !alreadySet.has(c.id)).slice(0, remaining)

  if (fresh.length === 0) return { assigned: 0, skipped_reason: 'all_already_received' }

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

/**
 * Fetch profile + run assignLeadsForTenant for a single user.
 * Used by Stripe webhook on signup + onboarding finish.
 */
export async function fireLeadEngineForUser(userId: string): Promise<AssignResult & { user_id: string }> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('user_id, plan_tier, service_area, service_zips, service_radius_mi, business_type, is_active')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !profile) {
    return { user_id: userId, assigned: 0, skipped_reason: 'profile_not_found' }
  }

  const result = await assignLeadsForTenant(profile as ProfileRow)
  return { user_id: userId, ...result }
}
