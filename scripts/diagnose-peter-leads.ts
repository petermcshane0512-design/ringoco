/**
 * Diagnose why Peter's first 10 dropped leads are 5.5-19.2mi from
 * 9232 S Bell Ave, Chicago — well past the 3mi promise.
 *
 * Pulls: profile (business_lat/lng/geocoded_at), batchdata_spend_log
 * for his user_id, lead_drops + joined leads, computes distance per
 * lead from business_lat/lng.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { distanceMiles } from '../src/lib/geocodeBusinessAddress'

config({ path: resolve(process.cwd(), '.env.local') })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const PETER_EMAIL = 'pmcshane@fordham.edu'

async function main() {
  // 1) Locate Peter's profile
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, business_name, business_address, business_lat, business_lng, business_geocoded_at, service_zips, service_radius_mi, business_type, plan_tier, is_active, setup_complete, last_batchdata_replenish_at, first_lead_drop_at, created_at')
    .or(`email.eq.${PETER_EMAIL},owner_phone.like.%7106510%`)
    .order('created_at', { ascending: false })
    .limit(5)

  if (!profiles || profiles.length === 0) {
    console.log('No profile found by email. Falling back to most-recent active officemgr tenant…')
    const { data: recent } = await supabase
      .from('profiles')
      .select('user_id, business_name, business_address, business_lat, business_lng, business_geocoded_at, service_zips, service_radius_mi, business_type, plan_tier, is_active, setup_complete, last_batchdata_replenish_at, first_lead_drop_at, created_at')
      .eq('plan_tier', 'officemgr')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(3)
    console.log('Recent tenants:')
    for (const p of (recent || []) as Array<Record<string, unknown>>) {
      console.log(' ', p)
    }
    return
  }

  const peter = profiles[0] as {
    user_id: string
    business_name: string | null
    business_address: string | null
    business_lat: number | null
    business_lng: number | null
    business_geocoded_at: string | null
    service_zips: string[] | null
    service_radius_mi: number | null
    business_type: string | null
    plan_tier: string | null
    is_active: boolean | null
    setup_complete: boolean | null
    last_batchdata_replenish_at: string | null
    first_lead_drop_at: string | null
    created_at: string
  }

  console.log('=== Profile ===')
  console.log('  user_id:                    ', peter.user_id)
  console.log('  business_name:              ', peter.business_name)
  console.log('  business_address:           ', peter.business_address)
  console.log('  business_lat / lng:         ', peter.business_lat, '/', peter.business_lng)
  console.log('  business_geocoded_at:       ', peter.business_geocoded_at)
  console.log('  service_zips:               ', peter.service_zips)
  console.log('  service_radius_mi:          ', peter.service_radius_mi)
  console.log('  business_type:              ', peter.business_type)
  console.log('  plan_tier:                  ', peter.plan_tier)
  console.log('  is_active / setup_complete: ', peter.is_active, '/', peter.setup_complete)
  console.log('  last_batchdata_replenish:   ', peter.last_batchdata_replenish_at)
  console.log('  first_lead_drop_at:         ', peter.first_lead_drop_at)
  console.log('  created_at:                 ', peter.created_at)
  console.log('')

  // 2) BatchData spend for THIS user
  const { data: spend } = await supabase
    .from('batchdata_spend_log')
    .select('cost_cents, caller, context, result_ok, spent_at')
    .eq('context->>user_id', peter.user_id)
    .order('spent_at', { ascending: false })
    .limit(50)
  console.log('=== BatchData spend log (last 50 rows for this user) ===')
  console.log(`  rows: ${spend?.length ?? 0}`)
  let totalCents = 0
  for (const s of (spend || []) as Array<{ cost_cents: number; caller: string; spent_at: string; result_ok: boolean; context: Record<string, unknown> }>) {
    totalCents += s.cost_cents
    console.log(`  ${s.spent_at.slice(0,19)}  ${s.caller.padEnd(18)} $${(s.cost_cents/100).toFixed(2)} ok=${s.result_ok} zip=${(s.context as { zip?: string }).zip ?? '-'}`)
  }
  console.log(`  total spent: $${(totalCents/100).toFixed(2)}`)
  console.log('')

  // 3) Lead drops for THIS user with computed distance from business
  const { data: drops } = await supabase
    .from('lead_drops')
    .select('id, drop_date, status, lead_id, leads(id, street_address, city, state, zip, owner_name, source, source_details, lead_score)')
    .eq('user_id', peter.user_id)
    .order('drop_date', { ascending: false })
    .limit(30)

  console.log('=== Lead drops for tenant (last 30, with distance) ===')
  console.log(`  rows: ${drops?.length ?? 0}`)
  if (peter.business_lat == null || peter.business_lng == null) {
    console.log('  business_lat/lng NULL — cannot compute distance')
  }

  type DropRow = { drop_date: string; status: string; lead_id: string; leads?: { street_address: string | null; zip: string | null; source: string | null; source_details: Record<string, unknown> | null; lead_score: number | null; city: string | null; state: string | null } | Array<Record<string, unknown>> | null }
  for (const raw of (drops || []) as unknown as DropRow[]) {
    const l = Array.isArray(raw.leads) ? (raw.leads[0] as { street_address?: string | null; zip?: string | null; source?: string | null; source_details?: Record<string, unknown> | null; lead_score?: number | null; city?: string | null; state?: string | null } | undefined) : raw.leads
    if (!l) { console.log(`  ${raw.drop_date.slice(0,10)}  status=${raw.status}  (no lead row)`); continue }
    // Try to get lat/lng from source_details (BatchData stamps lat/lng there) or compute from address geocode lookup table (not available here)
    const sd = l.source_details as { lat?: number; lng?: number; provider?: string; tag?: string } | undefined
    const lat = sd?.lat
    const lng = sd?.lng
    let distStr = '?'
    if (typeof lat === 'number' && typeof lng === 'number' && peter.business_lat != null && peter.business_lng != null) {
      distStr = `${distanceMiles(peter.business_lat, peter.business_lng, lat, lng).toFixed(2)}mi`
    }
    console.log(`  ${raw.drop_date.slice(0,10)}  ${(l.source ?? '-').padEnd(12)} score=${l.lead_score ?? '-'}  ${distStr.padStart(8)}  ${l.zip ?? '-'}  ${l.street_address?.slice(0,40) ?? '-'}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
