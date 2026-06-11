#!/usr/bin/env node
/**
 * dev-activate-me.mjs — founder dogfood helper.
 *
 * Flips an EXISTING profile to active so Peter can dogfood without a real
 * Stripe charge. Safe ONLY because it refuses to run unless the row is
 * already geocoded (business_lat present) — the null-geocode → scattered-
 * leads failure mode the handover warns about cannot happen here.
 *
 * Reads secrets from .env.local.prod first (pulled via
 *   npx vercel env pull .env.local.prod --environment production --yes
 * ), falling back to .env.local. The repo's committed .env.local ships
 * with EMPTY secret values, so the pull is required first.
 *
 * Run:
 *   node scripts/dev-activate-me.mjs <clerk_user_id>
 *   node scripts/dev-activate-me.mjs user_3EzyNQxe2wLSBM4wT4GcZjGNQ1E
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Prefer the freshly-pulled prod env; fall back to the committed (empty) one.
if (fs.existsSync('.env.local.prod')) dotenv.config({ path: '.env.local.prod', quiet: true })
else dotenv.config({ path: '.env.local', quiet: true })

const userId = process.argv[2]
if (!userId || !userId.startsWith('user_')) {
  console.error('Usage: node scripts/dev-activate-me.mjs <clerk_user_id>')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE env. Run:')
  console.error('  npx vercel env pull .env.local.prod --environment production --yes')
  process.exit(1)
}
const s = createClient(url, key)

const { data: prof, error: readErr } = await s
  .from('profiles')
  .select('user_id, business_name, business_lat, business_lng, service_zips, business_type, is_active')
  .eq('user_id', userId)
  .maybeSingle()

if (readErr) { console.error('read error:', readErr.message); process.exit(1) }
if (!prof) { console.error(`no profile for ${userId} — sign up first.`); process.exit(1) }

if (typeof prof.business_lat !== 'number') {
  console.error('REFUSING: profile has no geocoded address (business_lat is null).')
  console.error('Activating now would scatter leads. Go through /start/area so the')
  console.error('address geocodes, then re-run. (This is the handover safety rule.)')
  process.exit(1)
}

const { data, error } = await s
  .from('profiles')
  .update({
    is_active: true,
    plan_tier: 'officemgr',     // the weekly lead-drop tier
    setup_complete: true,
    paid_at: new Date().toISOString(),
  })
  .eq('user_id', userId)
  .select('user_id, is_active, plan_tier, business_name, service_zips, business_type, business_lat, business_lng')
  .single()

if (error) { console.error('update error:', error.message); process.exit(1) }
console.log('✓ ACTIVATED:')
console.log(JSON.stringify(data, null, 2))
console.log('\nNow open https://www.bellavego.com/dashboard/leads — the kick + 5s poll')
console.log('will fire the first drop. (Leads still need BatchData funded to pull.)')
