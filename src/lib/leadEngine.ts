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

// 2026-06-06 PIVOT — single public tier (officemgr) gets weekly Monday drop:
//   officemgr → 6 leads/week (≈25/month). Drops on first cron run each week.
//   Legacy tiers preserved for grandfathered customers (receptionist + concierge).
export const TIER_DROP_TARGET: Record<Tier, { period: 'quarterly' | 'monthly' | 'weekly'; perDrop: number }> = {
  receptionist: { period: 'quarterly', perDrop: 5 },
  officemgr:    { period: 'weekly',    perDrop: 5 },   // 5/wk × 4.33wk = ~22/mo (5/wk marketed)
  concierge:    { period: 'weekly',    perDrop: 25 },  // legacy Elite tier
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
  // 2026-06-06 — optional onboarding fields used to refine the lead pool
  sub_trade?: string | null
  min_ticket?: number | null   // USD
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

  // Radius ladder — start at tenant's setting, escalate twice if pool is
  // light. HARD CAP 50mi (~1hr drive). These are 1-4 person teams, not
  // regional contractors — surfacing a Maine HVAC guy leads in Boston is
  // worse than surfacing nothing.
  //   Per-trade base defaults set in onboarding:
  //     handyman 10mi, plumbing 15mi, HVAC/electrical 20mi, roofing 30mi
  const RADIUS_HARD_CAP = 50
  const baseRadius = Math.max(1, Math.min(RADIUS_HARD_CAP, profile.service_radius_mi ?? 20))
  const radiusLadder = [
    baseRadius,
    Math.min(RADIUS_HARD_CAP, Math.round(baseRadius * 1.5)),
    RADIUS_HARD_CAP,
  ]
  const dedup = new Set<string>()
  type Candidate = {
    id: string
    lead_score: number | null
    source: string
    trade_match: string[]
    zip: string
    street_address: string | null
    source_details: Record<string, unknown> | null
    city: string | null
    state: string | null
  }
  const candidates: Candidate[] = []
  let radiusUsed = baseRadius

  for (const r of radiusLadder) {
    radiusUsed = r
    const expanded = new Set<string>(homeZips)
    for (const hz of homeZips) {
      const { data: nearby } = await supabase.rpc('zips_within_miles', {
        primary_zip: hz,
        radius_mi: r,
      })
      if (Array.isArray(nearby)) {
        for (const z of nearby) {
          if (z?.zip) expanded.add(z.zip)
        }
      }
    }
    const eligibleZips = [...expanded]
    if (eligibleZips.length === 0) continue

    const { data: cs } = await supabase
      .from('leads')
      .select('id, lead_score, source, trade_match, zip, street_address, source_details, city, state')
      .contains('trade_match', [tradeFilter])
      .in('zip', eligibleZips)
      .order('lead_score', { ascending: false })
      .limit(remaining * 5)

    type CandidateRow = Candidate
    for (const c of (cs ?? []) as CandidateRow[]) {
      if (!dedup.has(c.id)) {
        dedup.add(c.id)
        candidates.push(c)
      }
    }
    if (candidates.length >= remaining * 2) break
  }

  // NO national fallback. If pool is light inside 50mi, the on-signup
  // discovery agent (api/agents/discover-for-tenant) is responsible for
  // backfilling — by triggering local scrapers + census-aging pulls for
  // the tenant's actual ZIPs. Cross-country leads are a worse experience
  // than a smaller drop.

  if (candidates.length === 0) {
    console.warn(`[lead-engine] no candidates for ${profile.user_id} (radius_used=${radiusUsed}mi, trade=${tradeFilter})`)
    return { assigned: 0, skipped_reason: 'no_candidates' }
  }

  // Apply min_ticket filter — drop anything below the contractor's floor.
  // Stored on the candidate via source_details.reported_cost (set by
  // permit scrapers). Falls through if cost not on the lead.
  let pool = candidates
  if (profile.min_ticket && profile.min_ticket > 0) {
    type CandidateWithDetails = (typeof candidates)[number] & { source_details?: { reported_cost?: number | string } | null }
    pool = candidates.filter((c) => {
      const cd = (c as CandidateWithDetails).source_details?.reported_cost
      const cost = typeof cd === 'string' ? parseFloat(cd) : (cd ?? 0)
      // If we don't know the cost, keep the lead — better to surface
      // borderline matches than over-filter. The contractor can still pass.
      if (!cost || !isFinite(cost)) return true
      return cost >= (profile.min_ticket as number)
    })
    if (pool.length === 0) pool = candidates // floor too aggressive — fall back
  }

  const { data: already } = await supabase
    .from('lead_drops')
    .select('lead_id')
    .eq('user_id', profile.user_id)
    .in('lead_id', pool.map((c) => c.id))
  const alreadySet = new Set((already || []).map((r) => r.lead_id))
  const fresh = pool.filter((c) => !alreadySet.has(c.id)).slice(0, remaining)

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

  // 2026-06-06 PIVOT — no auto-enrich on drop. Click-to-reveal pattern:
  // skip-trace only fires when the contractor taps "Reveal phone" on a
  // specific lead in the dashboard (POST /api/leads/[id]/reveal-phone).
  // This cuts skip-trace cost from $2.20/customer/mo to ~$1.50, only
  // spending on leads the contractor actually wants to call.

  // 2026-06-07 — stamp first_lead_drop_at on first successful drop +
  // SMS the contractor. Dashboard reads this column to swap the
  // "leads within 24h" countdown for the real leads view.
  //
  // Atomic update — only stamps if NULL, so we don't re-notify on
  // every weekly Monday drop. Fires the SMS only on the first transition.
  supabase
    .from('profiles')
    .update({ first_lead_drop_at: new Date().toISOString() })
    .eq('user_id', profile.user_id)
    .is('first_lead_drop_at', null)
    .select('user_id, owner_phone, business_name, twilio_number')
    .single()
    .then(async ({ data, error }) => {
      if (error) {
        // PGRST116 = no row matched (already stamped earlier — expected on weekly drops)
        if ((error as { code?: string }).code !== 'PGRST116') {
          console.warn('[lead-engine] first_lead_drop_at stamp failed:', error.message)
        }
        return
      }
      if (!data) return
      const row = data as { user_id: string; owner_phone: string | null; business_name: string | null }
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID
        const authToken = process.env.TWILIO_AUTH_TOKEN
        const fromNumber = process.env.TWILIO_PHONE_NUMBER
        if (!accountSid || !authToken || !fromNumber || !row.owner_phone) return
        const body = `🎯 BellAveGo: Your first 5 neighborhood leads just landed for ${row.business_name ?? 'your business'}. View them: https://www.bellavego.com/dashboard/leads`
        const params = new URLSearchParams({ From: fromNumber, To: row.owner_phone, Body: body })
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        })
      } catch (e) {
        console.warn('[lead-engine] first-drop SMS failed:', (e as Error).message)
      }
    })

  return { assigned: fresh.length }
}

/**
 * Fetch profile + run assignLeadsForTenant for a single user.
 * Used by Stripe webhook on signup + onboarding finish.
 */
export async function fireLeadEngineForUser(userId: string): Promise<AssignResult & { user_id: string }> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('user_id, plan_tier, service_area, service_zips, service_radius_mi, business_type, is_active, sub_trade, min_ticket')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !profile) {
    return { user_id: userId, assigned: 0, skipped_reason: 'profile_not_found' }
  }

  const result = await assignLeadsForTenant(profile as ProfileRow)
  return { user_id: userId, ...result }
}
