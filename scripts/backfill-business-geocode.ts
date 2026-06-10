/**
 * Backfill business_lat / business_lng for existing profiles.
 *
 * One-shot run after sql/2026-06-09-business-geocode.sql migration applies.
 * Geocodes any profile that has business_address but no lat/lng yet.
 *
 * Run:
 *   vercel env pull .env.local   # GOOGLE_MAPS_API_KEY + Supabase keys
 *   npx tsx scripts/backfill-business-geocode.ts
 *
 * Cost: $0.005 per geocode × number of existing customers. At < 100
 * customers this is well under a dollar.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json'

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    console.error('GOOGLE_MAPS_API_KEY not set. Aborting.')
    process.exit(1)
  }
  const url = `${ENDPOINT}?address=${encodeURIComponent(address)}&key=${key}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json() as {
    status: string
    results: { geometry: { location: { lat: number; lng: number } } }[]
  }
  if (data.status !== 'OK' || data.results.length === 0) return null
  return data.results[0].geometry.location
}

async function main() {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, business_name, business_address, business_lat, business_lng')
    .not('business_address', 'is', null)
    .is('business_lat', null)

  if (error) {
    console.error('Query failed:', error)
    process.exit(1)
  }

  const rows = data || []
  console.log(`Found ${rows.length} profile(s) with business_address but no lat/lng.`)
  if (rows.length === 0) {
    console.log('Nothing to backfill. Done.')
    return
  }

  let ok = 0
  let fail = 0
  for (const r of rows as { user_id: string; business_name?: string; business_address: string }[]) {
    const geo = await geocode(r.business_address)
    if (!geo) {
      console.log(`  ✗ ${r.user_id} (${r.business_name || '?'}) — geocode failed for "${r.business_address.slice(0, 60)}"`)
      fail++
      continue
    }
    const { error: upErr } = await supabase
      .from('profiles')
      .update({
        business_lat: geo.lat,
        business_lng: geo.lng,
        business_geocoded_at: new Date().toISOString(),
      })
      .eq('user_id', r.user_id)
    if (upErr) {
      console.log(`  ✗ ${r.user_id} — update failed: ${upErr.message}`)
      fail++
      continue
    }
    console.log(`  ✓ ${r.user_id} (${r.business_name || '?'}) — lat=${geo.lat.toFixed(4)} lng=${geo.lng.toFixed(4)}`)
    ok++
    // Be polite to Google's API.
    await new Promise((res) => setTimeout(res, 60))
  }

  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
