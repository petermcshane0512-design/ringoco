import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { batchdataPropertySearch, skipTraceAddress } from '@/lib/skipTrace'

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

function tradeFiltersFor(trade: string): TradeConfig {
  const t = (trade || '').toLowerCase()
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
    return {
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y) => `${o} is the owner-occupant${y ? ` of a ${y}-built home` : ''}. Reach out for water heater age check + sewer line inspection.`,
      whyTagBuilder: (y, sale, age) => [
        'Owner-occupied verified via Batch Data',
        y ? `Plumbing infrastructure age: ~${age}yr` : 'Owner-occupied',
        y && age >= 12 ? 'Water heater likely past 10yr service life' : 'Service-call window',
        sale ? `Last sold ${daysAgo(sale)}d ago` : 'Long-term owner — relationship play',
      ].filter(Boolean),
      sourceTag: 'property:owner-occupied-plumbing',
    }
  }
  if (t.includes('elect')) {
    return {
      yearBuiltMax: 1990,
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y) => `${o}'s home was built in ${y || 'pre-1990'} — panel + wiring likely original. Offer free panel inspection + EV-charger upgrade pitch.`,
      whyTagBuilder: (y) => [
        'Owner-occupied verified',
        y ? `Home built ${y} — panel likely original` : 'Pre-1990 build flagged',
        'Aluminum-wiring + 100A panel risk window',
        'EV-charger upgrade opportunity',
      ],
      sourceTag: 'property:old-panel-electrical',
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
  // HVAC default
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
  opts: { skipTraceTopN?: number; maxCandidates?: number } = {}
): Promise<{ ok: boolean; assigned: number; reason?: string; spent_cents?: number; zips_searched?: number; skip_traced?: number }> {
  const skipTraceTopN = opts.skipTraceTopN ?? 20
  const maxCandidates = opts.maxCandidates ?? 80

  const { data: profileRaw, error: profileErr } = await supabase
    .from('profiles')
    .select('user_id, service_zips, service_radius_mi, business_type, services_offered, service_area, sub_trade')
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

  const cfg = tradeFiltersFor(resolvedTrade)
  const tradeNormalized = normalizeTrade(resolvedTrade)
  const radius = Math.min(50, profile.service_radius_mi ?? 20)

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

    const result = await batchdataPropertySearch({
      zip,
      yearBuiltMin: cfg.yearBuiltMin,
      yearBuiltMax: cfg.yearBuiltMax,
      recentSaleWithinDays: cfg.recentSaleWithinDays,
      ownerOccupiedOnly: cfg.ownerOccupiedOnly,
      resultsLimit: perZipLimit,
    })
    spentCents += result.cost_cents

    if (!result.ok) {
      console.warn(`[find-real-leads] zip ${zip} search failed: ${result.error}`)
      continue
    }

    for (const p of result.properties) {
      if (!p.street_address || !p.zip) continue
      if (candidatesInserted >= maxCandidates) break

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

    let body: { user_id?: string; skip_trace_top_n?: number; max_candidates?: number } = {}
    try { body = await req.json() } catch { /* */ }
    if (!body.user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const result = await findLeadsForTenant(body.user_id, {
      skipTraceTopN: body.skip_trace_top_n,
      maxCandidates: body.max_candidates,
    })
    return NextResponse.json(result)
  } catch (e) {
    const err = e as { message?: string }
    return NextResponse.json({ ok: false, error: err.message || String(e) }, { status: 500 })
  }
}
