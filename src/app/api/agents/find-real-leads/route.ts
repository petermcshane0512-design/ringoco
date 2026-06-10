import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { batchdataPropertySearch, skipTraceAddress } from '@/lib/skipTrace'
import { canSpendBatchData, logBatchDataSpend } from '@/lib/batchdataSpend'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/agents/find-real-leads
 *
 * 2026-06-09 REWRITE — nationwide instant-coverage foundation.
 *
 * Old shape: pulled first 3 zips × 15 leads = max 45 candidates per tenant,
 * primary zips only. Worked for big metros, starved smaller ones.
 *
 * New shape: BatchData Property Search across ALL tenant zips + their
 * radius-expansion zips, up to a target pool of ~80 candidates per signup.
 * Optional auto-skip-trace on the top 20 highest-score candidates to
 * pre-populate phones for the Monday lead drop.
 *
 * Every US zip works. Every signup gets a real Monday drop.
 *
 * Trade filters preserved from prior rev:
 *   handyman    — recent home sales (120d, owner-occupied, 1970-2005 build)
 *   hvac        — owner-occupied, 1985-2005 build
 *   plumbing    — owner-occupied, any age
 *   electrical  — owner-occupied, built before 1990
 *   roofing     — owner-occupied, built before 2005
 *
 * Cost per run @ default budgets:
 *   - Property search: ~$0.05/result × 80 = $4.00
 *   - Skip-trace top 20: $0.10 × 20 = $2.00
 *   - Total CAC for instant on-signup coverage: ~$6
 *
 * Body: { user_id: string, skip_trace_top_n?: number, max_candidates?: number }
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type ProfileRow = {
  user_id: string
  service_zips: string[] | null
  service_radius_mi: number | null
  business_type: string | null
  services_offered: string | null
  service_area: string | null
  sub_trade: string | null
  // 2026-06-09 — tight-radius first-2-weeks fields. business_lat/lng populated by
  // /api/profile geocode on signup. first_lead_drop_at stamped by lead engine.
  business_lat: number | null
  business_lng: number | null
  first_lead_drop_at: string | null
}

// 2026-06-10 — SUPPLY-DRIVEN. Caller (lib/leadEngine) walks a 1mi -> cap
// ladder against the `leads` table itself and only fires this route when
// even the cap ring runs dry; the caller passes the radius it exhausted
// in `radius_mi` so BatchData refills the same ring. Default 1mi when
// caller does not specify (admin-direct invocation). Hard cap 20mi.
const RADIUS_TIGHT_MI = 1
const RADIUS_HARD_CAP_MI = 20

function resolveRadius(profile: ProfileRow, requested?: number | null): number {
  const userCap = Math.max(
    RADIUS_TIGHT_MI,
    Math.min(RADIUS_HARD_CAP_MI, profile.service_radius_mi ?? RADIUS_HARD_CAP_MI),
  )
  const r = typeof requested === 'number' && requested > 0 ? requested : RADIUS_TIGHT_MI
  return Math.max(RADIUS_TIGHT_MI, Math.min(userCap, r))
}

type TradeConfig = {
  yearBuiltMin?: number
  yearBuiltMax?: number
  recentSaleWithinDays?: number
  ownerOccupiedOnly: boolean
  pitchTemplate: (owner: string, yearBuilt: number | null, city: string | null) => string
  whyTagBuilder: (yearBuilt: number | null, lastSaleDate: string | null, ageYears: number) => string[]
  sourceTag: string
}

// 2026-06-10 — Recipe Lab climate buckets (scripts/recipes/REPORT.md).
// HVAC compressor / furnace lifetime varies sharply by climate. Single
// 1985-2005 window was wrong for hot metros — pre-2008 Phoenix homes have
// already replaced their AC 1-2 times. Cold-state furnaces last longer.
const HOT_STATES = new Set(['AZ', 'NV', 'TX', 'FL', 'NM', 'GA', 'AL', 'MS', 'LA', 'SC'])
const COLD_STATES = new Set(['MN', 'WI', 'IL', 'MI', 'NY', 'ME', 'NH', 'VT', 'MA', 'ND', 'SD', 'IA', 'MT', 'ID', 'WY', 'AK', 'CT', 'RI'])

function classifyClimate(state: string | null | undefined): 'hot' | 'cold' | 'mild' {
  const s = (state || '').toUpperCase()
  if (HOT_STATES.has(s)) return 'hot'
  if (COLD_STATES.has(s)) return 'cold'
  return 'mild'
}

function tradeFiltersFor(trade: string, state?: string | null): TradeConfig {
  const t = (trade || '').toLowerCase()
  // 2026-06-10 — "other:landscaping" / "other:painting" / etc. fall through
  // to the handyman recent-buyer recipe. Recent owner-occupied + aging-home
  // profile applies to almost any home-services trade.
  if (t.startsWith('other')) {
    return {
      recentSaleWithinDays: 120,
      yearBuiltMin: 1970,
      yearBuiltMax: 2005,
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y, c) => `${o} just bought a ${y || 'older'} home in ${c || 'the area'} — high-intent window for any home-services pitch.`,
      whyTagBuilder: (y, sale, age) => [
        sale ? `New owner — bought ${daysAgo(sale)}d ago` : 'Owner-occupied verified',
        y ? `Home built ${y} (${age}yr)` : 'Aging-home profile',
        'Recent-buyer deferred-maintenance window',
      ],
      sourceTag: 'property:recent-buyer-other',
    }
  }
  if (t.includes('handy') || t.includes('general')) {
    return {
      recentSaleWithinDays: 120,
      yearBuiltMin: 1970,
      yearBuiltMax: 2005,
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y, c) => `${o} just bought a ${y || 'older'} home in ${c || 'the area'} — perfect window for deferred-maintenance pitch (porches, decks, fence, garage doors).`,
      whyTagBuilder: (y, sale, age) => [
        sale ? `New owner — bought ${daysAgo(sale)}d ago` : 'Owner-occupied verified',
        y ? `Home built ${y} (${age}yr)` : 'Aging-home profile',
        'Deferred-maintenance window: first 4 months after purchase',
      ],
      sourceTag: 'property:recent-buyer-handyman',
    }
  }
  if (t.includes('plumb')) {
    // 2026-06-10 — Recipe Lab v1. Was: owner-occupied any age (no signal).
    // Now: 1900-1995 union of galvanized (1900-1969) + polybutylene
    // (1978-1995). 1970-1977 gap accepted as v1 noise; cast-iron-sewer
    // (1900-1980) fully covered by galvanized window.
    return {
      yearBuiltMin: 1900,
      yearBuiltMax: 1995,
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y) => {
        const era =
          y && y <= 1969 ? 'galvanized supply lines past 40-60yr life'
          : y && y >= 1978 ? 'polybutylene piping (Cox v. Shell class-action era)'
          : 'aging supply / drain infrastructure'
        return `${o}'s home was built in ${y || 'pre-1995'} — ${era}. Pitch free leak inspection + repipe quote.`
      },
      whyTagBuilder: (y, sale, age) => {
        const tags = ['Owner-occupied verified']
        if (y && y <= 1969) tags.push(`Built ${y} — galvanized supply lines past 40-60yr life`)
        else if (y && y >= 1978 && y <= 1995) tags.push(`Built ${y} — polybutylene piping (mass-replacement class)`)
        else if (y) tags.push(`Built ${y} (${age}yr) — aging plumbing infrastructure`)
        if (y && y <= 1980) tags.push('Cast-iron drain stack era — sewer-line backup risk')
        if (sale) tags.push(`Last sold ${daysAgo(sale)}d ago`)
        return tags
      },
      sourceTag: 'property:aging-plumbing',
    }
  }
  if (t.includes('elect')) {
    // 2026-06-10 — Recipe Lab v1. Was yearBuiltMax=1990. Recipe Lab says
    // 1980 (Federal Pacific Stab-Lok era ended; aluminum branch wiring
    // installed 1965-1975 lives entirely inside this window).
    return {
      yearBuiltMax: 1980,
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y) => `${o}'s home was built in ${y || 'pre-1980'} — panel + wiring likely 60-100A original (FPE Stab-Lok / aluminum-wiring era). Offer free panel inspection + 200A service upgrade quote.`,
      whyTagBuilder: (y) => [
        'Owner-occupied verified',
        y ? `Home built ${y} — panel likely original` : 'Pre-1980 build flagged',
        'Pre-1980 panel-brand risk window (FPE Stab-Lok, aluminum branch wiring)',
        '60-100A panel → 200A service upgrade opportunity',
      ],
      sourceTag: 'property:pre-1980-panel-electrical',
    }
  }
  if (t.includes('roof')) {
    return {
      yearBuiltMin: 1985,
      yearBuiltMax: 2005,
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y) => `${o}'s home roof is ${y ? new Date().getFullYear() - y : '20+'} years old — past typical asphalt lifespan. Pitch free inspection.`,
      whyTagBuilder: (y, _, age) => [
        'Owner-occupied verified',
        y ? `Roof age ~${age}yr (built ${y})` : 'Aging-roof profile',
        age >= 18 ? 'Asphalt past 15-20yr replacement window' : 'Inspection window approaching',
        'Free-inspection pitch high-close template',
      ],
      sourceTag: 'property:aging-roof',
    }
  }
  // HVAC default — 2026-06-10 Recipe Lab climate-aware routing.
  // Hot states (AZ/NV/TX/FL/NM/GA/AL/MS/LA/SC) → AC compressors fail
  // 10-15yr in sustained 100°F+. Target 2008-2015 builds (11-18yr-old,
  // first-replacement-cycle); pre-2008 hot-metro builds have replaced 1-2x.
  // Cold states (MN/WI/IL/MI/NY/ME/NH/VT/MA/ND/SD/IA/MT/ID/WY/AK/CT/RI)
  // → gas furnaces last 18-25yr. Target 1990-2008 first-replacement.
  // Mild → keep 1985-2005 baseline (Recipe Lab `hvac-mild-baseline`).
  const climate = classifyClimate(state)
  if (climate === 'hot') {
    return {
      yearBuiltMin: 2008,
      yearBuiltMax: 2015,
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y, c) => `${o}'s ${y || '2008-2015'}-built home in ${c || 'your area'} — original AC compressor in this climate fails at 10-15yr. Pitch free system audit + replacement quote BEFORE peak heat.`,
      whyTagBuilder: (y, _, age) => [
        'Owner-occupied verified',
        y ? `Home built ${y} — AC age ~${age}yr (hot climate)` : 'Hot-climate profile',
        'Hot-climate AC compressor failure window (10-15yr)',
        'First-replacement-cycle homeowner (pre-2008 builds already replaced)',
      ],
      sourceTag: 'property:hot-climate-hvac',
    }
  }
  if (climate === 'cold') {
    return {
      yearBuiltMin: 1990,
      yearBuiltMax: 2008,
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y, c) => `${o}'s ${y || '1990-2008'}-built home in ${c || 'your area'} — gas furnace likely original, 18-25yr lifespan in cold climate. Pitch free combustion safety check + replacement quote.`,
      whyTagBuilder: (y, _, age) => [
        'Owner-occupied verified',
        y ? `Home built ${y} — furnace age ~${age}yr (cold climate)` : 'Cold-climate profile',
        'Cold-climate gas furnace replacement window (18-25yr)',
        'First-replacement-cycle homeowner',
      ],
      sourceTag: 'property:cold-climate-hvac',
    }
  }
  // Mild climate baseline.
  return {
    yearBuiltMin: 1985,
    yearBuiltMax: 2005,
    ownerOccupiedOnly: true,
    pitchTemplate: (o, y) => `${o}'s home was built in ${y || '1985-2005'} — AC/furnace likely past 15-25yr lifespan. Pitch free tune-up or replacement quote.`,
    whyTagBuilder: (y, _, age) => [
      'Owner-occupied verified',
      y ? `Home built ${y} — HVAC age ~${age}yr` : 'Aging-home profile',
      age >= 15 ? 'AC/furnace past expected 15yr lifespan' : 'Tune-up window',
      'R-410A phase-out replacement opportunity',
    ],
    sourceTag: 'property:aging-hvac',
  }
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

function normalizeTrade(blob: string): 'hvac' | 'plumbing' | 'electrical' | 'roofing' | 'handyman' {
  const b = blob.toLowerCase()
  if (b.includes('handy') || b.includes('general') || b.includes('repair')) return 'handyman'
  if (b.includes('plumb')) return 'plumbing'
  if (b.includes('elect')) return 'electrical'
  if (b.includes('roof')) return 'roofing'
  return 'hvac'
}

async function expandRadius(homeZips: string[], radius: number): Promise<string[]> {
  const eligible = new Set<string>(homeZips)
  for (const hz of homeZips) {
    const { data: nearby } = await supabase.rpc('zips_within_miles', {
      primary_zip: hz,
      radius_mi: radius,
    })
    if (Array.isArray(nearby)) {
      for (const z of nearby) {
        if (z?.zip) eligible.add(z.zip)
      }
    }
  }
  return [...eligible]
}

async function findLeadsForTenant(
  userId: string,
  opts: { skipTraceTopN?: number; maxCandidates?: number; radiusMi?: number } = {}
): Promise<{ ok: boolean; assigned: number; reason?: string; spent_cents?: number; zips_searched?: number; skip_traced?: number }> {
  const skipTraceTopN = opts.skipTraceTopN ?? 20
  const maxCandidates = opts.maxCandidates ?? 80

  const { data: profileRaw, error: profileErr } = await supabase
    .from('profiles')
    .select('user_id, service_zips, service_radius_mi, business_type, services_offered, service_area, sub_trade, business_lat, business_lng, first_lead_drop_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (profileErr || !profileRaw) {
    return { ok: false, assigned: 0, reason: `profile fetch failed: ${profileErr?.message || 'not found'}` }
  }
  const profile = profileRaw as ProfileRow
  const homeZips = (profile.service_zips || []).filter(Boolean)
  if (homeZips.length === 0) return { ok: false, assigned: 0, reason: 'no service_zips' }

  // Resolve trade w/ business_type → services_offered fallback for "Other" picks.
  const resolvedTrade = (profile.business_type && profile.business_type.toLowerCase() !== 'other')
    ? profile.business_type
    : (profile.services_offered || profile.business_type || '')
  if (!resolvedTrade) return { ok: false, assigned: 0, reason: 'no business_type or services_offered' }

  // 2026-06-10 — Recipe Lab climate routing. Look up state from
  // zip_centroids on the tenant's primary zip so tradeFiltersFor can pick
  // the HVAC hot/cold/mild recipe. Fail-soft: null state -> mild baseline.
  let tenantState: string | null = null
  if (homeZips[0]) {
    const { data: zc } = await supabase
      .from('zip_centroids')
      .select('state')
      .eq('zip', homeZips[0])
      .maybeSingle()
    tenantState = (zc as { state?: string } | null)?.state ?? null
  }

  const cfg = tradeFiltersFor(resolvedTrade, tenantState)
  const tradeNormalized = normalizeTrade(resolvedTrade)

  // 2026-06-10 — SUPPLY-DRIVEN radius. Caller passes radiusMi (lib/leadEngine
  // does so based on which rung of its 3->cap ladder ran dry). Default 3mi
  // when caller does not specify. Bounded by user's service_radius_mi cap
  // and the 20mi hard cap inside resolveRadius().
  const hasGeocodedBusinessLoc =
    typeof profile.business_lat === 'number' &&
    typeof profile.business_lng === 'number'

  const radius = resolveRadius(profile, opts.radiusMi)
  // tightRadiusActive controls the haversine post-filter. Always on when we
  // have a geocoded business location — defends against zip-edge bleed.
  const tightRadiusActive = hasGeocodedBusinessLoc

  if (tightRadiusActive) {
    console.log(`[find-real-leads] user_id=${userId} ADDRESS-RADIUS ${radius}mi (dynamic ladder) from lat=${profile.business_lat} lng=${profile.business_lng}`)
  } else {
    console.log(`[find-real-leads] user_id=${userId} ZIP-RADIUS ${radius}mi (dynamic ladder; no business_lat/lng — geocode missing)`)
  }

  // 2026-06-10 — Fable replenishment dedup. Build a set of street addresses
  // we've already delivered to THIS tenant so refill pulls don't churn-letter
  // them week-9 leads they already saw week-3. Lower-cased + trimmed +
  // suffixed w/ zip so "123 main st" in 78704 != 78705.
  const priorAddrKeys = new Set<string>()
  {
    const { data: priorDrops } = await supabase
      .from('lead_drops')
      .select('lead_id, leads(street_address, zip)')
      .eq('user_id', userId)
      .limit(5000)
    // PostgREST returns nested selects as arrays even when the FK is
    // many-to-one. Handle both shapes (object | array | null) defensively
    // via unknown bridge — the TS narrowing rules reject the direct cast.
    type DropRow = { leads?: { street_address: string | null; zip: string | null } | Array<{ street_address: string | null; zip: string | null }> | null }
    for (const raw of (priorDrops || []) as unknown as DropRow[]) {
      const lead = Array.isArray(raw?.leads) ? raw.leads[0] : raw?.leads
      const sa = lead?.street_address
      const z = lead?.zip
      if (sa && z) priorAddrKeys.add(`${sa.trim().toLowerCase()}|${z}`)
    }
  }

  // Expand to radius zips so coverage matches what the lead engine actually
  // delivers to the dashboard. Previously only searched the 3 primary zips
  // — meant small-metro signups got ~0 candidates beyond their home zip.
  const eligibleZips = await expandRadius(homeZips, radius)

  // Search up to ceil(maxCandidates / 15) zips at 15 results each. Prioritize
  // the tenant's primary zips first, then radius expansion.
  const primarySet = new Set(homeZips)
  const orderedZips = [
    ...eligibleZips.filter((z) => primarySet.has(z)),
    ...eligibleZips.filter((z) => !primarySet.has(z)),
  ]
  const perZipLimit = 15
  const zipsToSearch = Math.min(orderedZips.length, Math.ceil(maxCandidates / perZipLimit) + 2)

  let spentCents = 0
  let candidatesInserted = 0
  const insertedLeadIds: string[] = []
  type InsertedCandidate = {
    leadId: string
    score: number
    street: string
    city: string | null
    state: string | null
    zip: string
  }
  const candidatesForSkipTrace: InsertedCandidate[] = []
  let zipsSearched = 0

  for (const zip of orderedZips.slice(0, zipsToSearch)) {
    if (candidatesInserted >= maxCandidates) break
    zipsSearched++

    // 2026-06-10 — Fable cap re-check. Estimate $0.05 per result × perZipLimit
    // = 75 cents per zip search. canSpendBatchData returns false if today's
    // total spend would exceed BATCHDATA_DAILY_CAP_USD (default $10).
    const estCents = perZipLimit * 5
    const canSpend = await canSpendBatchData(estCents)
    if (!canSpend.ok) {
      console.warn(`[find-real-leads] daily cap hit at zip ${zip} — spent=${canSpend.spentTodayCents} cap=${canSpend.capCents}. Aborting further searches.`)
      break
    }

    const result = await batchdataPropertySearch({
      zip,
      yearBuiltMin: cfg.yearBuiltMin,
      yearBuiltMax: cfg.yearBuiltMax,
      recentSaleWithinDays: cfg.recentSaleWithinDays,
      ownerOccupiedOnly: cfg.ownerOccupiedOnly,
      resultsLimit: perZipLimit,
    })
    spentCents += result.cost_cents
    await logBatchDataSpend({
      costCents: result.cost_cents,
      caller: 'find-real-leads',
      context: { user_id: userId, zip, trade: tradeNormalized },
      resultOk: result.ok,
    })

    if (!result.ok) {
      console.warn(`[find-real-leads] zip ${zip} search failed: ${result.error}`)
      continue
    }

    for (const p of result.properties) {
      if (!p.street_address || !p.zip) continue
      if (candidatesInserted >= maxCandidates) break

      // 2026-06-10 — Fable dedup. Skip BatchData properties already
      // delivered to this tenant in any prior drop. The leads-table unique
      // constraint (street_address, source) handles cross-tenant dedup but
      // not "we already showed Bob this address week-3."
      const addrKey = `${p.street_address.trim().toLowerCase()}|${p.zip}`
      if (priorAddrKeys.has(addrKey)) continue

      // Tight-radius post-filter (defense in depth — zip-based query can
      // bleed past the literal mile radius near zip edges). Drops any
      // property whose lat/lng is > radius (dynamic ladder) from the
      // contractor's business location. Only runs when we have a geocoded
      // business location AND BatchData returned a lat/lng on the property.
      if (tightRadiusActive) {
        const pLat = (p as unknown as { lat?: number | null }).lat
        const pLng = (p as unknown as { lng?: number | null }).lng
        if (typeof pLat === 'number' && typeof pLng === 'number') {
          const { distanceMiles } = await import('@/lib/geocodeBusinessAddress')
          const miles = distanceMiles(profile.business_lat!, profile.business_lng!, pLat, pLng)
          if (miles > radius) continue
        }
      }

      const ageYears = p.year_built ? new Date().getFullYear() - p.year_built : 0
      const whyTags = cfg.whyTagBuilder(p.year_built, p.last_sale_date, ageYears)
      const pitch = cfg.pitchTemplate(p.owner_name || 'Homeowner', p.year_built, p.city)

      const leadScore = (() => {
        let s = 65
        if (p.last_sale_date) {
          const d = daysAgo(p.last_sale_date)
          if (d < 90) s += 25
          else if (d < 180) s += 15
          else if (d < 365) s += 8
        }
        if (p.year_built && ageYears > 25) s += 10
        if (p.year_built && ageYears >= 15 && ageYears <= 25) s += 5
        if (p.home_value_est && p.home_value_est > 400_000) s += 3
        return Math.min(100, s)
      })()

      const { data: inserted, error: insertErr } = await supabase
        .from('leads')
        .insert({
          street_address: p.street_address,
          city: p.city,
          state: p.state,
          zip: p.zip,
          owner_name: p.owner_name,
          home_value_est: p.home_value_est,
          year_built: p.year_built,
          sqft: p.sqft,
          source: 'permit',
          source_event_date: p.last_sale_date || null,
          source_details: {
            provider: 'batchdata',
            last_sale_date: p.last_sale_date,
            last_sale_price: p.last_sale_price,
            tag: cfg.sourceTag,
            // 2026-06-09 — richer WHY tags for dashboard card explanation.
            // Each tag is a 1-sentence reason this lead surfaced, ranked
            // by importance. Dashboard card renders these as a bulleted
            // "why we pulled this" list directly under the address.
            why_tags: whyTags,
            owner_age_years: ageYears || null,
            radius_zip_match: orderedZips.indexOf(zip) >= homeZips.length ? 'radius' : 'primary',
          },
          lead_score: leadScore,
          pitch_script: pitch,
          trade_match: [tradeNormalized],
        })
        .select('id')
        .single()

      if (!insertErr && inserted?.id) {
        candidatesInserted++
        insertedLeadIds.push(inserted.id)
        if (leadScore >= 80 && candidatesForSkipTrace.length < skipTraceTopN) {
          candidatesForSkipTrace.push({
            leadId: inserted.id,
            score: leadScore,
            street: p.street_address,
            city: p.city,
            state: p.state,
            zip: p.zip,
          })
        }
      } else if (insertErr && (insertErr as { code?: string }).code !== '23505') {
        console.warn(`[find-real-leads] insert err for ${p.street_address}: ${insertErr.message}`)
      }
    }
  }

  // Auto skip-trace top-N high-score candidates so the Monday drop has
  // verified phones day 1. CAC trade: ~$2 per signup. Worth it — first-
  // drop lead w/o phone = visible failure mode for retention.
  let skipTracedCount = 0
  if (candidatesForSkipTrace.length > 0) {
    candidatesForSkipTrace.sort((a, b) => b.score - a.score)
    for (const cand of candidatesForSkipTrace.slice(0, skipTraceTopN)) {
      const trace = await skipTraceAddress({
        street: cand.street,
        city: cand.city || undefined,
        state: cand.state || undefined,
        zip: cand.zip,
      })
      spentCents += trace.cost_cents
      if (trace.ok && trace.hit) {
        skipTracedCount++
        const phone = trace.owner_phones?.[0] || null
        const email = trace.owner_emails?.[0] || null
        await supabase
          .from('leads')
          .update({
            owner_phone: phone,
            owner_email: email,
            skip_trace_attempted_at: new Date().toISOString(),
            skip_trace_hit: true,
          })
          .eq('id', cand.leadId)
      } else {
        await supabase
          .from('leads')
          .update({
            skip_trace_attempted_at: new Date().toISOString(),
            skip_trace_hit: false,
          })
          .eq('id', cand.leadId)
      }
    }
  }

  // 2026-06-10 — stamp last_batchdata_replenish_at for the cooldown gate
  // used by lib/leadEngine.ts auto-replenish branch. Always stamp on a
  // completed pull, whether or not we inserted candidates — the spend
  // already happened, and we don't want lead-engine retrying every hour
  // against an empty zip cluster.
  await supabase
    .from('profiles')
    .update({ last_batchdata_replenish_at: new Date().toISOString() })
    .eq('user_id', userId)

  return {
    ok: true,
    assigned: candidatesInserted,
    spent_cents: spentCents,
    zips_searched: zipsSearched,
    skip_traced: skipTracedCount,
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res

    let body: { user_id?: string; skip_trace_top_n?: number; max_candidates?: number; radius_mi?: number } = {}
    try { body = await req.json() } catch { /* */ }
    if (!body.user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const result = await findLeadsForTenant(body.user_id, {
      skipTraceTopN: body.skip_trace_top_n,
      maxCandidates: body.max_candidates,
      radiusMi: body.radius_mi,
    })
    return NextResponse.json(result)
  } catch (e) {
    const err = e as { message?: string }
    return NextResponse.json({ ok: false, error: err.message || String(e) }, { status: 500 })
  }
}
