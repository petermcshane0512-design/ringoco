#!/usr/bin/env node
/**
 * Diagnostic — figure out why Peter's handyman test account still shows
 * the 5 census-aging leads instead of fresh BatchData property leads.
 *
 * Checks:
 *   1. Does Peter's profile have business_type + service_zips set?
 *   2. Did find-real-leads ever insert BatchData leads? (look for
 *      source_details->>'provider' = 'batchdata' rows)
 *   3. What are his current lead_drops pointing at?
 *
 * Read-only. Safe to run.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env.local')

try {
  const env = readFileSync(envPath, 'utf8')
  env.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  })
} catch (e) { console.error('env read failed:', e.message); process.exit(1) }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

// Find Peter's account — most recent profile with handyman business_type
console.log('\n=== 1. Peter\'s profile ===')
const { data: profiles } = await supabase
  .from('profiles')
  .select('user_id, business_name, business_type, service_zips, service_radius_mi, is_active, plan_tier, twilio_number, first_lead_drop_at, created_at')
  .order('created_at', { ascending: false })
  .limit(5)
console.log(`Last 5 profiles:`)
for (const p of profiles || []) {
  console.log(`  ${p.user_id.slice(0,12)}... | ${p.business_name || '(no name)'} | type=${p.business_type || '(null)'} | zips=${JSON.stringify(p.service_zips || [])} | active=${p.is_active}`)
}

const handyman = (profiles || []).find((p) => (p.business_type || '').toLowerCase().includes('handy'))
if (!handyman) {
  console.log('\n⚠ No handyman profile found in last 5 signups.')
  process.exit(0)
}
console.log(`\n→ Using profile: ${handyman.user_id} (${handyman.business_name})`)
console.log(`  business_type=${handyman.business_type}`)
console.log(`  service_zips=${JSON.stringify(handyman.service_zips)}`)
console.log(`  service_radius_mi=${handyman.service_radius_mi}`)
console.log(`  first_lead_drop_at=${handyman.first_lead_drop_at}`)

console.log('\n=== 2. BatchData leads in the pool (any user) ===')
const { count: batchCount } = await supabase
  .from('leads')
  .select('*', { count: 'exact', head: true })
  .filter('source_details->>provider', 'eq', 'batchdata')
console.log(`Total batchdata-provider leads in leads table: ${batchCount ?? 0}`)

if ((batchCount ?? 0) > 0) {
  const { data: sample } = await supabase
    .from('leads')
    .select('street_address, city, state, zip, owner_name, year_built, lead_score, trade_match, created_at')
    .filter('source_details->>provider', 'eq', 'batchdata')
    .order('created_at', { ascending: false })
    .limit(5)
  console.log('Sample batchdata leads:')
  for (const l of sample || []) {
    console.log(`  ${l.street_address}, ${l.city}, ${l.state} ${l.zip} | ${l.owner_name || '?'} | built ${l.year_built} | score ${l.lead_score} | trade ${JSON.stringify(l.trade_match)}`)
  }
} else {
  console.log('⚠ NO BatchData leads in pool — find-real-leads never ran successfully OR API rejected the search.')
}

console.log('\n=== 3. Peter\'s current lead_drops ===')
const { data: drops } = await supabase
  .from('lead_drops')
  .select('id, status, drop_date, lead:leads(id, street_address, zip, source, source_details, trade_match, owner_name)')
  .eq('user_id', handyman.user_id)
  .order('drop_date', { ascending: false })
  .limit(10)
console.log(`Total drops: ${drops?.length || 0}`)
for (const d of drops || []) {
  const l = d.lead
  const prov = l?.source_details?.provider || 'census-aging-or-permit'
  console.log(`  drop ${d.id.slice(0,8)} | ${l?.street_address || `ZIP ${l?.zip} (no address)`} | source=${l?.source} provider=${prov} trade=${JSON.stringify(l?.trade_match)}`)
}

console.log('\n=== 4. Address-level leads in Peter\'s ZIPs ===')
const zips = handyman.service_zips || []
if (zips.length > 0) {
  const { data: localAddr } = await supabase
    .from('leads')
    .select('street_address, zip, owner_name, source, source_details, trade_match')
    .in('zip', zips)
    .not('street_address', 'is', null)
    .limit(10)
  console.log(`Address-level leads in ${JSON.stringify(zips)}: ${localAddr?.length || 0}`)
  for (const l of localAddr || []) {
    console.log(`  ${l.street_address} ${l.zip} | ${l.owner_name || '?'} | source=${l.source} trade=${JSON.stringify(l.trade_match)}`)
  }
}
