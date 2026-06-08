import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { batchdataPropertySearch } from '@/lib/skipTrace'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/agents/find-real-leads
 *
 * Replaces census-aging "ZIP-only" inferences with REAL address-level
 * leads via BatchData Property Search API. Works for ANY US ZIP, no
 * city-specific scraper needed.
 *
 * Trade-specific filters:
 *   handyman    — recent home sales (90d, owner-occupied, 1970-2005 build)
 *                 = deferred-maintenance opportunities
 *   hvac        — owner-occupied, 1985-2005 build
 *                 = AC/furnace likely past lifespan (15-25 yrs)
 *   plumbing    — owner-occupied, any age (plumbing emergencies happen anywhere)
 *   electrical  — owner-occupied, built before 1990 (old panels need upgrades)
 *   roofing     — owner-occupied, built before 2005 (asphalt roof age window)
 *
 * Skip-trace is NOT auto-fired here — that's still click-to-reveal on the
 * dashboard. We just populate REAL street addresses + owner names that
 * the contractor can door-knock OR pay $0.10 to phone-reveal.
 *
 * Cost: ~$0.05/property returned × 5-15 leads = $0.25-$0.75 per agent run.
 *
 * Body: { user_id: string }
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type ProfileRow = {
  user_id: string
  service_zips: string[] | null
  business_type: string | null
  service_area: string | null
  sub_trade: string | null
}

function tradeFiltersFor(trade: string): {
  yearBuiltMin?: number
  yearBuiltMax?: number
  recentSaleWithinDays?: number
  ownerOccupiedOnly: boolean
  pitchTemplate: (owner: string, yearBuilt: number | null) => string
  sourceTag: string
} {
  const t = (trade || '').toLowerCase()
  if (t.includes('handy') || t.includes('general')) {
    return {
      recentSaleWithinDays: 120,
      yearBuiltMin: 1970,
      yearBuiltMax: 2005,
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y) => `${o} just bought a ${y || 'older'} home — perfect window for deferred-maintenance pitch (porches, decks, fence repair, garage doors).`,
      sourceTag: 'property:recent-buyer-handyman',
    }
  }
  if (t.includes('plumb')) {
    return {
      ownerOccupiedOnly: true,
      pitchTemplate: (o) => `${o} is the owner-occupant. Reach out for water heater age check + sewer line inspection.`,
      sourceTag: 'property:owner-occupied-plumbing',
    }
  }
  if (t.includes('elect')) {
    return {
      yearBuiltMax: 1990,
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y) => `${o}'s home was built in ${y} — panel + wiring likely original. Offer free panel inspection.`,
      sourceTag: 'property:old-panel-electrical',
    }
  }
  if (t.includes('roof')) {
    return {
      yearBuiltMin: 1985,
      yearBuiltMax: 2005,
      ownerOccupiedOnly: true,
      pitchTemplate: (o, y) => `${o}'s home roof is ${y ? new Date().getFullYear() - y : '20+'} years old — past typical asphalt lifespan. Pitch free inspection.`,
      sourceTag: 'property:aging-roof',
    }
  }
  // HVAC default
  return {
    yearBuiltMin: 1985,
    yearBuiltMax: 2005,
    ownerOccupiedOnly: true,
    pitchTemplate: (o, y) => `${o}'s home was built in ${y} — AC/furnace likely past 15-25 yr lifespan. Pitch free tune-up or replacement quote.`,
    sourceTag: 'property:aging-hvac',
  }
}

async function findLeadsForTenant(userId: string): Promise<{ ok: boolean; assigned: number; reason?: string; spent_cents?: number }> {
  const { data: profileRaw, error: profileErr } = await supabase
    .from('profiles')
    .select('user_id, service_zips, business_type, service_area, sub_trade')
    .eq('user_id', userId)
    .maybeSingle()
  if (profileErr || !profileRaw) {
    return { ok: false, assigned: 0, reason: `profile fetch failed: ${profileErr?.message || 'not found'}` }
  }
  const profile = profileRaw as ProfileRow
  const zips = (profile.service_zips || []).filter(Boolean)
  if (zips.length === 0) return { ok: false, assigned: 0, reason: 'no service_zips' }
  if (!profile.business_type) return { ok: false, assigned: 0, reason: 'no business_type' }

  const cfg = tradeFiltersFor(profile.business_type)
  let spentCents = 0
  let insertedTotal = 0

  // Search each of their service ZIPs. Cap at first 3 ZIPs to control cost.
  for (const zip of zips.slice(0, 3)) {
    const result = await batchdataPropertySearch({
      zip,
      yearBuiltMin: cfg.yearBuiltMin,
      yearBuiltMax: cfg.yearBuiltMax,
      recentSaleWithinDays: cfg.recentSaleWithinDays,
      ownerOccupiedOnly: cfg.ownerOccupiedOnly,
      resultsLimit: 15,
    })
    spentCents += result.cost_cents

    if (!result.ok) {
      console.warn(`[find-real-leads] zip ${zip} search failed: ${result.error}`)
      continue
    }

    const tradeNormalized = profile.business_type.toLowerCase().includes('handy') ? 'handyman'
      : profile.business_type.toLowerCase().includes('plumb') ? 'plumbing'
      : profile.business_type.toLowerCase().includes('elect') ? 'electrical'
      : profile.business_type.toLowerCase().includes('roof') ? 'roofing'
      : 'hvac'

    // Insert each property as a lead row. Dedup via UNIQUE (street_address, source).
    for (const p of result.properties) {
      if (!p.street_address || !p.zip) continue
      const pitch = cfg.pitchTemplate(p.owner_name || 'Homeowner', p.year_built)
      const leadScore = (() => {
        let s = 65  // base for real address-level lead
        if (p.last_sale_date) {
          const daysAgo = (Date.now() - new Date(p.last_sale_date).getTime()) / (1000 * 60 * 60 * 24)
          if (daysAgo < 90) s += 25
          else if (daysAgo < 180) s += 15
          else if (daysAgo < 365) s += 8
        }
        if (p.year_built && (new Date().getFullYear() - p.year_built) > 25) s += 10
        return Math.min(100, s)
      })()

      const { error: insertErr } = await supabase.from('leads').insert({
        street_address: p.street_address,
        city: p.city,
        state: p.state,
        zip: p.zip,
        owner_name: p.owner_name,
        home_value_est: p.home_value_est,
        year_built: p.year_built,
        sqft: p.sqft,
        source: 'permit', // reuse 'permit' bucket — address-level real lead
        source_event_date: p.last_sale_date || null,
        source_details: {
          provider: 'batchdata',
          last_sale_date: p.last_sale_date,
          last_sale_price: p.last_sale_price,
          tag: cfg.sourceTag,
        },
        lead_score: leadScore,
        pitch_script: pitch,
        trade_match: [tradeNormalized],
      })
      if (!insertErr) {
        insertedTotal++
      } else if ((insertErr as { code?: string }).code !== '23505') {
        console.warn(`[find-real-leads] insert err for ${p.street_address}: ${insertErr.message}`)
      }
    }
  }

  return { ok: true, assigned: insertedTotal, spent_cents: spentCents }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res

    let body: { user_id?: string } = {}
    try { body = await req.json() } catch { /* */ }
    if (!body.user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const result = await findLeadsForTenant(body.user_id)
    return NextResponse.json(result)
  } catch (e) {
    const err = e as { message?: string }
    return NextResponse.json({ ok: false, error: err.message || String(e) }, { status: 500 })
  }
}
