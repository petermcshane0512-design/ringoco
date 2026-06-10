/**
 * One-shot backfill for Peter's tenant (created 2026-06-07, predates
 * auto-geocode webhook). Geocodes business_address, stamps lat/lng,
 * then fires find-real-leads to seed his 80-property BatchData pool
 * around 9232 S Bell Ave.
 *
 * Pass --commit to write. Dry-run by default.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { geocodeBusinessAddress } from '../src/lib/geocodeBusinessAddress'

config({ path: resolve(process.cwd(), '.env.local') })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const USER_ID = 'user_3EoeIMV76GZZp5DcpgPBHiVbLNZ'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.bellavego.com'

async function main() {
  const commit = process.argv.includes('--commit')

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, business_address, business_lat, business_lng, business_type, service_zips')
    .eq('user_id', USER_ID)
    .maybeSingle()
  if (!profile) { console.error('profile not found'); process.exit(1) }

  const p = profile as { user_id: string; business_address: string | null; business_lat: number | null; business_lng: number | null; business_type: string | null; service_zips: string[] | null }
  console.log('Current profile:', p)
  console.log('')

  if (!p.business_address) { console.error('no business_address — abort'); process.exit(1) }

  console.log(`Geocoding "${p.business_address}"…`)
  const geo = await geocodeBusinessAddress(p.business_address)
  if (!geo) { console.error('geocode failed'); process.exit(1) }
  console.log(`  -> lat=${geo.lat} lng=${geo.lng}  (${geo.formatted})`)
  console.log('')

  if (!commit) {
    console.log('DRY-RUN. Pass --commit to:')
    console.log(`  1) UPDATE profiles set business_lat=${geo.lat}, business_lng=${geo.lng}, business_geocoded_at=now() where user_id=${USER_ID}`)
    console.log('  2) POST /api/agents/find-real-leads { user_id, max_candidates: 80, skip_trace_top_n: 20 }')
    return
  }

  const { error: updErr } = await supabase
    .from('profiles')
    .update({
      business_lat: geo.lat,
      business_lng: geo.lng,
      business_geocoded_at: new Date().toISOString(),
    })
    .eq('user_id', USER_ID)
  if (updErr) { console.error('profile update err:', updErr.message); process.exit(1) }
  console.log('  ✓ profile stamped\n')

  console.log('Firing /api/agents/find-real-leads for user_id…')
  const r = await fetch(`${APP_URL}/api/agents/find-real-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.ADMIN_API_SECRET || '' },
    body: JSON.stringify({ user_id: USER_ID, max_candidates: 80, skip_trace_top_n: 20 }),
  })
  const j = await r.json().catch(() => ({}))
  console.log(`  HTTP ${r.status}  ${JSON.stringify(j).slice(0, 500)}`)
}
main().catch(e => { console.error(e); process.exit(1) })
