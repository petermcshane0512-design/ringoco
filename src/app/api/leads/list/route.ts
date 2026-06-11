import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { TIER_FEATURES, isValidTier, type Tier } from '@/lib/pricing'

export const runtime = 'nodejs'

/**
 * GET /api/leads/list
 *
 * Returns the current tenant's lead drops (newest first) + their tier's
 * quota usage. Powers the /dashboard/leads tab.
 *
 * Auth: Clerk session (the dashboard authenticates the user).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// 2026-06-07 — officemgr (the single public tier) drops 5/week = 20/month.
// Display reads "of 20 this month" instead of the prior 15.
const TIER_CADENCE: Record<Tier, { period: 'quarterly' | 'monthly' | 'weekly'; per: number; label: string }> = {
  receptionist: { period: 'quarterly', per: 5,  label: 'this quarter' },
  officemgr:    { period: 'monthly',   per: 20, label: 'this month' },
  concierge:    { period: 'weekly',    per: 25, label: 'this week' },
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Resolve tenant by Clerk userId → profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, plan_tier, next_lead_drop_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: 'profile not found' }, { status: 404 })

  const tier = profile.plan_tier || 'receptionist'
  const validTier = isValidTier(tier) ? (tier as Tier) : 'receptionist'
  const cadence = TIER_CADENCE[validTier]

  // Drop period start
  const now = new Date()
  let periodStart: Date
  if (cadence.period === 'weekly') {
    periodStart = new Date(now)
    periodStart.setDate(now.getDate() - now.getDay())
    periodStart.setHours(0, 0, 0, 0)
  } else if (cadence.period === 'monthly') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  } else {
    const q = Math.floor(now.getMonth() / 3)
    periodStart = new Date(now.getFullYear(), q * 3, 1)
  }

  const { data: dropsRaw } = await supabase
    .from('lead_drops')
    .select(`
      id, drop_date, drop_period, status, notes,
      lead:leads (
        id, street_address, city, state, zip, owner_name, owner_phone, owner_email,
        home_value_est, year_built, sqft, source, lead_score, pitch_script,
        skip_trace_attempted_at, skip_trace_hit, lat, lng, source_details
      )
    `)
    .eq('user_id', userId)
    .order('drop_date', { ascending: false })
    .limit(50)

  // Exclude aging_hvac rows: synthetic zip-aggregate placeholders, never
  // deliverable as per-property leads. Customer-facing surfaces never show
  // invented data (Peter rule 2026-06-10).
  const drops = (dropsRaw || []).filter((d) => {
    if (!d.lead) return false
    const lead = d.lead as unknown as { source?: string | null }
    return lead.source !== 'aging_hvac'
  })

  const usedThisPeriod = drops.filter((d) => new Date(d.drop_date) >= periodStart).length

  return NextResponse.json({
    drops,
    quota: {
      tier: validTier,
      tier_display: TIER_FEATURES[validTier].leadsCadence,
      cadence: cadence.period,
      cadence_label: cadence.label,
      per_drop: cadence.per,
      used_this_period: usedThisPeriod,
    },
    next_lead_drop_at: profile.next_lead_drop_at,
  })
}
