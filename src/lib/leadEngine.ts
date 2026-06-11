import { createClient } from '@supabase/supabase-js'
import { isValidTier, type Tier } from '@/lib/pricing'
import { LEADS_PER_WEEK } from '@/lib/offer'
import { skipTraceAddress } from '@/lib/skipTrace'

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

// 2026-06-09 — perDrop now reads LEADS_PER_WEEK from src/lib/offer.ts.
// The single source of truth covers both code and marketing copy. Bump
// LEADS_PER_WEEK there (after measuring real supply per metro) — both
// the cron and the homepage will pick it up automatically.
// Legacy tiers preserved for grandfathered customers (receptionist + concierge).
export const TIER_DROP_TARGET: Record<Tier, { period: 'quarterly' | 'monthly' | 'weekly'; perDrop: number }> = {
  receptionist: { period: 'quarterly', perDrop: 5 },
  officemgr:    { period: 'weekly',    perDrop: LEADS_PER_WEEK },
  concierge:    { period: 'weekly',    perDrop: 25 },  // legacy Elite tier
}

const VALID_TRADES = ['hvac', 'plumbing', 'electrical', 'roofing', 'handyman'] as const
type Trade = (typeof VALID_TRADES)[number]

// 2026-06-07 — normalizeTrade now reads BOTH business_type AND
// services_offered. When business_type is the literal string "Other"
// (or unknown), services_offered's free-text gets mapped against the
// same keyword buckets. Fixes the silent-drop bug where contractors
// picked "Other" + typed "Handyman services" — business_type stayed
// "Other" and the lead engine refused to drop anything.
//
// Returns null only if NEITHER field resolves to a known trade.
export function normalizeTrade(raw: string | null | undefined, servicesOffered?: string | null): Trade | null {
  const candidates = [raw, servicesOffered].filter(Boolean).map((s) => (s as string).toLowerCase().trim())
  for (const t of candidates) {
    if (!t) continue
    if (t.includes('plumb')) return 'plumbing'
    if (t.includes('elect')) return 'electrical'
    if (t.includes('roof')) return 'roofing'
    if (t.includes('handy') || t.includes('general') || t.includes('repair') || t.includes('remodel') || t.includes('renovation') || t.includes('carpentr') || t.includes('drywall') || t.includes('paint') || t.includes('fence') || t.includes('deck') || t.includes('porch') || t.includes('garage')) return 'handyman'
    if (t.includes('hvac') || t.includes('air condition') || t.includes('a/c') || t.includes('ac ') || t.includes('furnace') || t.includes('heat pump') || t.includes('cooling') || t.includes('heating')) return 'hvac'
  }
  return null  // genuinely unknown trade → no drop (correct guard)
}

export type ProfileRow = {
  user_id: string
  plan_tier: string | null
  service_area: string | null
  service_zips: string[] | null
  service_radius_mi: number | null
  business_type: string | null
  // 2026-06-07 — services_offered carries the free-text trade name when
  // business_type is the literal "Other". normalizeTrade reads BOTH.
  services_offered?: string | null
  is_active: boolean | null
  sub_trade?: string | null
  min_ticket?: number | null
  // 2026-06-10 — cooldown gate on auto-replenish. Stamped by find-real-leads
  // every time it completes a BatchData pull. Lead engine refuses to fire
  // another replenish for this tenant if last stamp < 24h ago.
  last_batchdata_replenish_at?: string | null
  // 2026-06-10 — distance-asc ranking. Geocoded from the business address
  // entered at /start/area. Engine sorts candidates by haversine distance
  // from this point so the closest leads always go out first.
  business_lat?: number | null
  business_lng?: number | null
}

// Haversine distance in miles. Inlined here to avoid a runtime import
// dependency from src/app. Same math as src/lib/geocodeBusinessAddress.ts
// distanceMiles().
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8 // earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

const REPLENISH_COOLDOWN_HOURS = 24

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

  const tradeFilter = normalizeTrade(profile.business_type, profile.services_offered)
  if (!tradeFilter) {
    return { assigned: 0, skipped_reason: `unrecognized_trade — business_type="${profile.business_type}" services_offered="${profile.services_offered}". Edit in Settings.` }
  }
  const homeZips = (profile.service_zips || []).filter(Boolean)
  if (homeZips.length === 0) return { assigned: 0, skipped_reason: 'no_service_zips' }

  // 2026-06-10 — SUPPLY-DRIVEN ring-by-ring ladder.
  // Per Peter: every drop asks "is the 1mi ring enough? 2mi? 3mi? ..."
  // and stops at the first ring that fills the quota. Closest leads
  // always go out first; no time-based widening, no tenant-setting
  // floor that would skip the close-in rings.
  //
  // Hard cap 20 (solo HVAC/plumb/roof don't drive past 20mi for
  // residential service). userCap = min(profile.service_radius_mi,
  // RADIUS_HARD_CAP); existing higher values clamped down silently.
  const RADIUS_START_MI = 1
  const RADIUS_HARD_CAP = 20
  const RADIUS_STEP_MI = 1
  const userCap = Math.max(
    RADIUS_START_MI,
    Math.min(RADIUS_HARD_CAP, profile.service_radius_mi ?? RADIUS_HARD_CAP),
  )
  // 2026-06-10 — first-8-weeks tight cap. Per Peter: "All 10 leads
  // within 1 mile. If not 1mi then 2mi. If not 2mi then 3mi. Strive
  // for all 10 within 1 mile especially for the first batch."
  // Ladder = [1, 2, 3] during tight window. After 8 weeks the ladder
  // walks to userCap.
  const TIGHT_FIRST_WEEKS = 8
  const TIGHT_CAP_MI = 3
  // Shared city-scraper rows are ONLY acceptable within this cap regardless
  // of which ring the engine is on. BatchData per-tenant rows accept the
  // current ring up to TIGHT_CAP_MI. Prevents 60643/zip-match permit rows
  // from filling at ring=3 when they sit 2.5mi from the business address.
  const SHARED_POOL_MAX_MI = 1
  const firstLeadDropAt = (profile as unknown as { first_lead_drop_at?: string | null }).first_lead_drop_at ?? null
  const weeksSinceFirstDrop = firstLeadDropAt
    ? Math.floor((Date.now() - new Date(firstLeadDropAt).getTime()) / (7 * 86400000))
    : 0
  const effectiveCap = weeksSinceFirstDrop < TIGHT_FIRST_WEEKS
    ? Math.min(TIGHT_CAP_MI, userCap)
    : userCap
  const radiusLadder: number[] = []
  for (let r = RADIUS_START_MI; r <= effectiveCap; r += RADIUS_STEP_MI) radiusLadder.push(r)
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
    lat: number | null
    lng: number | null
    _distMi?: number  // computed post-query, never written to DB
  }
  const candidates: Candidate[] = []
  let radiusUsed = RADIUS_START_MI
  // 2026-06-10 — Defense-in-depth haversine filter inside the ring loop.
  // Zip-based query bleeds past the literal mile boundary at zip edges.
  // When we have a geocoded business location, drop any candidate whose
  // straight-line distance exceeds the current ring. Without geocode, we
  // trust the zip filter (legacy behavior).
  const hasGeocode =
    typeof profile.business_lat === 'number' && typeof profile.business_lng === 'number'

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
      .select('id, lead_score, source, trade_match, zip, street_address, source_details, city, state, lat, lng')
      .contains('trade_match', [tradeFilter])
      .in('zip', eligibleZips)
      .order('lead_score', { ascending: false })
      .limit(remaining * 5)

    type CandidateRow = Candidate
    for (const c of (cs ?? []) as CandidateRow[]) {
      if (dedup.has(c.id)) continue
      // Source classification — per Peter 2026-06-10: shared city-scraper
      // rows (Chicago/Austin/Orlando permits + storm + move_in + the now-
      // deleted aging_hvac) are tenant-agnostic and may pile up close-zip
      // but far-address. They count ONLY if literally within 1mi of the
      // business location. BatchData per-tenant rows (source_details.
      // provider='batchdata') are intentionally anchored on the business
      // lat/lng — they accept the current ring up to TIGHT_CAP_MI.
      const provider = (c.source_details as { provider?: string } | null)?.provider
      const isBatchData = provider === 'batchdata'
      if (hasGeocode && typeof c.lat === 'number' && typeof c.lng === 'number') {
        const miles = haversineMiles(profile.business_lat!, profile.business_lng!, c.lat, c.lng)
        if (isBatchData) {
          if (miles > r) continue
        } else {
          if (miles > SHARED_POOL_MAX_MI) continue
        }
        c._distMi = miles
      } else if (!isBatchData) {
        // Shared-pool row with no lat/lng on the lead. We can't measure the
        // distance — BUT if it sits in one of the contractor's OWN home
        // zips (exact match, not a radius-expanded neighbor), the zip itself
        // is proximity enough for a local trade. Keep those; skip only the
        // radius-expanded neighbors we genuinely can't place.
        //
        // 2026-06-11 — this was a silent regression: a GEOCODED account
        // (hasGeocode=true) fell through to this branch for every latlng-less
        // shared lead and skipped ALL of them, so geocoded tenants received
        // zero shared-pool leads even in their home zip. A null-geocode
        // account hit the legacy zip path and got them. That's why Peter's
        // freshly-geocoded handyman/60643 account drew an empty pool while
        // his older null-geocode account had drops.
        if (!homeZips.includes(c.zip)) continue
      }
      dedup.add(c.id)
      candidates.push(c)
    }
    if (candidates.length >= remaining * 2) break
  }

  // 2026-06-10 — auto-replenish branch.
  //
  // Old behavior (deleted): empty pool → log warn → return 0. The on-signup
  // discover-for-tenant agent was named as the backfill mechanism but only
  // fires on Stripe webhook + onboarding save — never re-fires post-signup.
  // Result: every tenant ran out of leads at ~week 9 with no recovery.
  //
  // New behavior: when pool is empty AND last_batchdata_replenish_at is
  // older than REPLENISH_COOLDOWN_HOURS, fire find-real-leads inline.
  // BatchData daily cap re-checked inside find-real-leads itself, so a
  // signup-flood day still can't burn unbounded $.
  // 2026-06-10 — replenish trigger lowered: fire if pool is SHORT of the
  // drop target (not only when empty). Combined w/ tight 3mi outer cap
  // above, this means: tight-radius ring runs short -> auto-pull BatchData
  // around the business address -> next iteration finds enough close-in
  // candidates. Outer auto-widen pre-2026-06-10 is no longer needed.
  if (candidates.length < remaining) {
    const lastReplenish = profile.last_batchdata_replenish_at
    const cooldownMs = REPLENISH_COOLDOWN_HOURS * 60 * 60 * 1000
    const cooldownOK = !lastReplenish || (Date.now() - new Date(lastReplenish).getTime()) > cooldownMs

    if (cooldownOK) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.bellavego.com'
      try {
        const r = await fetch(`${appUrl}/api/agents/find-real-leads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': process.env.ADMIN_API_SECRET || '',
          },
          // Pass the widest rung from the supply-driven ladder so BatchData
          // refills the SAME radius we already exhausted in leads — caps the
          // spend ring + keeps replenished leads close to the business
          // address. Never goes past userCap (= min(service_radius_mi, 20)).
          body: JSON.stringify({ user_id: profile.user_id, max_candidates: 80, skip_trace_top_n: 10, radius_mi: radiusUsed }),
        })
        const json = await r.json().catch(() => ({}))
        console.log(`[lead-engine] auto-replenished user=${profile.user_id} assigned=${json.assigned ?? 0} spent_cents=${json.spent_cents ?? 0}`)

        // Re-query candidates after replenish. Reuse the widest radius from
        // the ladder above so we pick up anything find-real-leads inserted.
        const widestExpanded = new Set<string>(homeZips)
        for (const hz of homeZips) {
          const { data: nearby } = await supabase.rpc('zips_within_miles', {
            primary_zip: hz,
            radius_mi: radiusLadder[radiusLadder.length - 1],
          })
          if (Array.isArray(nearby)) {
            for (const z of nearby) {
              if (z?.zip) widestExpanded.add(z.zip)
            }
          }
        }
        const { data: refilled } = await supabase
          .from('leads')
          .select('id, lead_score, source, trade_match, zip, street_address, source_details, city, state, lat, lng')
          .contains('trade_match', [tradeFilter])
          .in('zip', [...widestExpanded])
          .order('lead_score', { ascending: false })
          .limit(remaining * 5)
        for (const c of (refilled ?? []) as Candidate[]) {
          if (dedup.has(c.id)) continue
          // Same source-aware filter as the ring loop above. Shared-pool
          // rows must be within 1mi; BatchData rows accept effectiveCap.
          const provider = (c.source_details as { provider?: string } | null)?.provider
          const isBatchData = provider === 'batchdata'
          if (hasGeocode && typeof c.lat === 'number' && typeof c.lng === 'number') {
            const miles = haversineMiles(profile.business_lat!, profile.business_lng!, c.lat, c.lng)
            if (isBatchData) {
              if (miles > effectiveCap) continue
            } else {
              if (miles > SHARED_POOL_MAX_MI) continue
            }
            c._distMi = miles
          } else if (!isBatchData) {
            // Same home-zip allowance as the ring loop — keep latlng-less
            // shared leads that sit in the contractor's own home zips.
            if (!homeZips.includes(c.zip)) continue
          }
          dedup.add(c.id)
          candidates.push(c)
        }
      } catch (e) {
        console.warn(`[lead-engine] auto-replenish failed for ${profile.user_id}: ${(e as Error).message}`)
      }
    } else {
      console.warn(`[lead-engine] empty pool for ${profile.user_id} but cooldown active — last replenish ${lastReplenish}`)
    }
  }

  if (candidates.length === 0) {
    console.warn(`[lead-engine] no candidates for ${profile.user_id} (radius_used=${radiusUsed}mi, trade=${tradeFilter})`)
    return { assigned: 0, skipped_reason: 'no_candidates' }
  }

  // 2026-06-10 — DISTANCE-ASC PRIMARY SORT. Per Peter: "prioritizing all
  // the leads closer to 0 miles as possible." Compute haversine distance
  // from the geocoded business address, then sort ascending so the closest
  // candidates land at the top before any score/sub_trade re-ranking
  // applies. Leads with no lat/lng (legacy rows) get a sentinel max so they
  // fall to the bottom but aren't dropped.
  if (typeof profile.business_lat === 'number' && typeof profile.business_lng === 'number') {
    const bLat = profile.business_lat
    const bLng = profile.business_lng
    for (const c of candidates) {
      c._distMi =
        typeof c.lat === 'number' && typeof c.lng === 'number'
          ? haversineMiles(bLat, bLng, c.lat, c.lng)
          : Number.POSITIVE_INFINITY
    }
    candidates.sort((a, b) => {
      const da = a._distMi ?? Number.POSITIVE_INFINITY
      const db = b._distMi ?? Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      return (b.lead_score ?? 0) - (a.lead_score ?? 0)
    })
  }

  // Apply sub_trade BOOST first — promote leads matching the contractor's
  // specialty keywords to the top of the candidate list. Doesn't filter
  // anything out, just re-ranks.
  if (profile.sub_trade && profile.sub_trade.trim()) {
    type CandidateWithDetails = (typeof candidates)[number] & { source_details?: { description?: string; work_class?: string; permit_type?: string } | null }
    const subKeywords = profile.sub_trade
      .toLowerCase()
      .split(/[,;/]| and | & /)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3)
    if (subKeywords.length > 0) {
      candidates.sort((a, b) => {
        const aDetails = (a as CandidateWithDetails).source_details
        const bDetails = (b as CandidateWithDetails).source_details
        const aBlob = `${aDetails?.description ?? ''} ${aDetails?.work_class ?? ''} ${aDetails?.permit_type ?? ''}`.toLowerCase()
        const bBlob = `${bDetails?.description ?? ''} ${bDetails?.work_class ?? ''} ${bDetails?.permit_type ?? ''}`.toLowerCase()
        const aMatch = subKeywords.some((k) => aBlob.includes(k))
        const bMatch = subKeywords.some((k) => bBlob.includes(k))
        if (aMatch && !bMatch) return -1
        if (bMatch && !aMatch) return 1
        return (b.lead_score ?? 0) - (a.lead_score ?? 0)
      })
    }
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

  // 2026-06-11 per Peter: "all ten leads should have a phone number, even
  // if the name's not listed." Skip-trace every phoneless lead AT DROP
  // TIME (was: only find-real-leads' top-N got traced; shared permit rows
  // never did → "No phone on file" boof leads). skipTraceAddress is
  // centrally spend-capped + logged, so a flood can't drain the balance.
  // A miss still delivers the lead (some addresses are untraceable; the
  // address + permit signal beats nothing) but stamps the attempt so the
  // UI says "no phone on file" honestly instead of showing a reveal button.
  {
    const needPhone = (await supabase
      .from('leads')
      .select('id, owner_phone, street_address, city, state, zip')
      .in('id', fresh.map((c) => c.id))
    ).data?.filter((l) => !l.owner_phone && l.street_address) ?? []
    for (const l of needPhone) {
      const trace = await skipTraceAddress({
        street: l.street_address as string,
        city: (l as { city?: string | null }).city ?? undefined,
        state: (l as { state?: string | null }).state ?? undefined,
        zip: l.zip ?? undefined,
      })
      await supabase
        .from('leads')
        .update({
          skip_trace_attempted_at: new Date().toISOString(),
          skip_trace_hit: trace.ok && trace.hit,
          ...(trace.ok && trace.hit ? {
            owner_phone: trace.owner_phones?.[0] ?? null,
            owner_email: trace.owner_emails?.[0] ?? null,
            ...(trace.owner_name ? { owner_name: trace.owner_name } : {}),
          } : {}),
        })
        .eq('id', l.id)
    }
  }

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

  // 2026-06-08 — rolling 7-day cadence. Dashboard countdown reads this
  // column; cron only fires drops for tenants whose next_lead_drop_at has
  // passed.
  //
  // 2026-06-11 FIX per Peter's 1-of-10 partial drop: stamping +7d on EVERY
  // successful drop locked the week away after a partial fill (1 lead
  // delivered → 9 owed → timer says "come back in 7 days"). Now the +7d
  // stamp only lands when this drop FILLS the period quota. A partial drop
  // leaves next_lead_drop_at untouched so the dashboard kick + cron keep
  // retrying to top up the remaining slots (e.g. the moment BatchData is
  // funded).
  if (fresh.length >= remaining) {
    const nextDropAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    await supabase
      .from('profiles')
      .update({ next_lead_drop_at: nextDropAt })
      .eq('user_id', profile.user_id)
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
        const body = `🎯 BellAveGo: Your first ${LEADS_PER_WEEK} neighborhood leads just landed for ${row.business_name ?? 'your business'}. View them: https://www.bellavego.com/dashboard/leads`
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
    .select('user_id, plan_tier, service_area, service_zips, service_radius_mi, business_type, services_offered, is_active, sub_trade, min_ticket, last_batchdata_replenish_at, business_lat, business_lng')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !profile) {
    return { user_id: userId, assigned: 0, skipped_reason: 'profile_not_found' }
  }

  const result = await assignLeadsForTenant(profile as ProfileRow)
  return { user_id: userId, ...result }
}
