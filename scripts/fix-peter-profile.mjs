#!/usr/bin/env node
/**
 * One-shot: find Peter's most-recent active profile, set business_type
 * to 'handyman', delete his existing lead_drops, reset first_lead_drop_at.
 *
 * Then he just refreshes /dashboard/leads and either:
 *   (a) saves onboarding wizard again → triggers fire-first-drop → real leads
 *   (b) waits for daily lead-engine cron (10am UTC) → real leads
 *
 * Read-write to prod Supabase via service-role key. Idempotent.
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

// Find the most recent ACTIVE profile (Peter's bellavegollc test account)
const { data: profiles } = await supabase
  .from('profiles')
  .select('user_id, business_name, business_type, services_offered, service_zips, is_active, created_at')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(5)

if (!profiles?.length) {
  console.error('No active profiles found.')
  process.exit(1)
}
console.log('Found active profiles:')
for (const p of profiles) {
  console.log(`  ${p.user_id.slice(0,16)}... | ${p.business_name} | type=${p.business_type} | services=${p.services_offered}`)
}

const peter = profiles[0]
console.log(`\nUsing: ${peter.user_id} (${peter.business_name})`)

// 1. Update business_type to 'handyman'
const { error: updErr } = await supabase
  .from('profiles')
  .update({
    business_type: 'handyman',
    services_offered: 'handyman services',
    first_lead_drop_at: null,
  })
  .eq('user_id', peter.user_id)
if (updErr) { console.error('profile update failed:', updErr.message); process.exit(1) }
console.log('✓ business_type → "handyman"')
console.log('✓ first_lead_drop_at → null')

// 2. Delete all existing lead_drops for Peter
const { data: drops } = await supabase
  .from('lead_drops')
  .select('id')
  .eq('user_id', peter.user_id)
console.log(`Found ${drops?.length || 0} existing lead_drops to delete...`)
const { error: delErr } = await supabase
  .from('lead_drops')
  .delete()
  .eq('user_id', peter.user_id)
if (delErr) { console.error('drop delete failed:', delErr.message); process.exit(1) }
console.log(`✓ deleted ${drops?.length || 0} lead_drops`)

console.log('\n────────────────────────────────────────')
console.log('Peter profile clean. Next step:')
console.log('1. Refresh https://www.bellavego.com/dashboard/leads — should be empty')
console.log('2. Either save the onboarding wizard at /onboarding to trigger fire-first-drop')
console.log('3. OR wait for daily lead-engine cron (10am UTC) — drops 5 handyman leads')
console.log('────────────────────────────────────────')
