import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { fireLeadEngineForUser } from '@/lib/leadEngine'
import { batchdataPropertySearch } from '@/lib/skipTrace'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/admin/reset-and-refire-leads
 *
 * One-call surgery for a single user_id (admin-gated). Used to fix a
 * test account where the early lead drops landed wrong (wrong trade,
 * census-aging garbage, etc.).
 *
 * Body:
 *   { user_id: string,
 *     set_business_type?: string,    // optional override
 *     set_service_zips?: string[] }  // optional override
 *
 * Steps:
 *   1. (optional) Patch profile.business_type + service_zips
 *   2. Delete ALL existing lead_drops for this user
 *   3. Delete the user's first_lead_drop_at so countdown resets
 *   4. Run batchdataPropertySearch directly for each service zip + log
 *      what BatchData actually returned (so we see if the API is broken
 *      OR just empty for that zip)
 *   5. Insert any returned properties as leads (skip if dupes)
 *   6. Run fireLeadEngineForUser to drop 5 fresh leads
 *
 * Returns the full diagnostic trace.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Profile = {
  user_id: string
  business_type: string | null
  service_zips: string[] | null
  sub_trade: string | null
}

function tradeFiltersFor(trade: string) {
  const t = (trade || '').toLowerCase()
  if (t.includes('handy') || t.includes('general')) {
    return { recentSaleWithinDays: 180, yearBuiltMin: 1970, yearBuiltMax: 2010, ownerOccupiedOnly: true,
      pitchTemplate: (o: string, y: number | null) => `${o} just bought a ${y || 'home'} — perfect deferred-maintenance window (porches, decks, fence, garage).`, tradeMatch: ['handyman'] }
  }
  if (t.includes('plumb')) {
    return { ownerOccupiedOnly: true,
      pitchTemplate: (o: string) => `${o} is the owner. Reach out for water heater age check + sewer line inspection.`, tradeMatch: ['plumbing'] }
  }
  if (t.includes('elect')) {
    return { yearBuiltMax: 1990, ownerOccupiedOnly: true,
      pitchTemplate: (o: string, y: number | null) => `${o}'s home built ${y} — panel likely original. Offer free inspection.`, tradeMatch: ['electrical'] }
  }
  if (t.includes('roof')) {
    return { yearBuiltMin: 1985, yearBuiltMax: 2005, ownerOccupiedOnly: true,
      pitchTemplate: (o: string, y: number | null) => `${o}'s roof is ${y ? new Date().getFullYear() - y : '20+'} yrs old. Offer free inspection.`, tradeMatch: ['roofing'] }
  }
  return { yearBuiltMin: 1985, yearBuiltMax: 2005, ownerOccupiedOnly: true,
    pitchTemplate: (o: string, y: number | null) => `${o}'s home built ${y} — AC/furnace past 15-25 yr lifespan. Offer free tune-up.`, tradeMatch: ['hvac'] }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res

    let body: { user_id?: string; set_business_type?: string; set_service_zips?: string[] }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
    if (!body.user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const trace: Array<{ step: string; ok: boolean; detail?: unknown }> = []

    // Step 1 — patch profile if requested
    if (body.set_business_type || body.set_service_zips) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.set_business_type) patch.business_type = body.set_business_type
      if (body.set_service_zips) patch.service_zips = body.set_service_zips
      const { error } = await supabase.from('profiles').update(patch).eq('user_id', body.user_id)
      trace.push({ step: 'patch_profile', ok: !error, detail: error?.message || patch })
    }

    // Step 2 — fetch current profile state
    const { data: profileRaw } = await supabase
      .from('profiles')
      .select('user_id, business_type, service_zips, sub_trade')
      .eq('user_id', body.user_id)
      .maybeSingle()
    const profile = profileRaw as Profile | null
    if (!profile) return NextResponse.json({ error: 'profile not found', trace }, { status: 404 })
    trace.push({ step: 'fetch_profile', ok: true, detail: { business_type: profile.business_type, service_zips: profile.service_zips } })

    // Step 3 — wipe existing lead_drops + reset first_lead_drop_at
    const { count: dropsBefore } = await supabase
      .from('lead_drops')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', body.user_id)
    await supabase.from('lead_drops').delete().eq('user_id', body.user_id)
    await supabase.from('profiles').update({ first_lead_drop_at: null }).eq('user_id', body.user_id)
    trace.push({ step: 'wipe_drops', ok: true, detail: { dropped: dropsBefore } })

    // Step 4 — BatchData property search for each service zip
    if (!profile.business_type || !profile.service_zips?.length) {
      trace.push({ step: 'batchdata_search', ok: false, detail: 'no business_type or service_zips after patch' })
      return NextResponse.json({ ok: false, trace })
    }
    const cfg = tradeFiltersFor(profile.business_type)
    const zipResults: Array<{ zip: string; ok: boolean; count: number; error?: string }> = []
    let insertedReal = 0
    for (const zip of profile.service_zips.slice(0, 3)) {
      const r = await batchdataPropertySearch({
        zip,
        yearBuiltMin: cfg.yearBuiltMin,
        yearBuiltMax: cfg.yearBuiltMax,
        recentSaleWithinDays: cfg.recentSaleWithinDays,
        ownerOccupiedOnly: cfg.ownerOccupiedOnly,
        resultsLimit: 25,
      })
      zipResults.push({ zip, ok: r.ok, count: r.properties.length, error: r.error })
      if (!r.ok) continue
      for (const p of r.properties) {
        if (!p.street_address || !p.zip) continue
        const pitch = cfg.pitchTemplate(p.owner_name || 'Homeowner', p.year_built)
        const { error } = await supabase.from('leads').insert({
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
          source_details: { provider: 'batchdata', last_sale_date: p.last_sale_date, last_sale_price: p.last_sale_price },
          lead_score: 90,  // real address-level always outranks census-aging
          pitch_script: pitch,
          trade_match: cfg.tradeMatch,
        })
        if (!error) insertedReal++
      }
    }
    trace.push({ step: 'batchdata_search', ok: zipResults.some((r) => r.ok), detail: { zips: zipResults, inserted: insertedReal } })

    // Step 5 — fire lead engine to drop 5 fresh
    const dropResult = await fireLeadEngineForUser(body.user_id)
    trace.push({ step: 'fire_lead_engine', ok: dropResult.assigned > 0, detail: dropResult })

    return NextResponse.json({ ok: true, trace })
  } catch (e) {
    const err = e as { message?: string; stack?: string }
    return NextResponse.json({
      ok: false,
      error: 'unhandled exception',
      detail: err.message || String(e),
    }, { status: 500 })
  }
}
