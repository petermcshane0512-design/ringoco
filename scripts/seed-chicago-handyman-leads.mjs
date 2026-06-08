#!/usr/bin/env node
/**
 * Standalone — pulls Chicago handyman permits directly from
 * data.cityofchicago.org Socrata API (FREE, no auth), filters to
 * handyman-relevant work, inserts as leads tagged 'handyman', then
 * re-fires the lead engine for the active handyman test profile.
 *
 * Bypasses BatchData entirely. Real addresses, real homeowners, real
 * permits filed in the last 60 days.
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

const SINCE = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const URL = `https://data.cityofchicago.org/resource/ydr8-5enu.json?$where=issue_date >= '${SINCE}'&$limit=2000&$order=issue_date DESC`

console.log(`Fetching Chicago permits since ${SINCE}...`)
const t0 = Date.now()
const r = await fetch(encodeURI(URL))
if (!r.ok) { console.error(`HTTP ${r.status}`); process.exit(1) }
const raw = await r.json()
console.log(`  → got ${raw.length} permits in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

function classifyHandyman(p) {
  const blob = `${p.permit_type || ''} ${p.work_description || ''} ${p.permit_ || ''}`.toLowerCase()
  return /\b(porch|deck|fence|garage|handyman|general|repair|renovat|remodel|drywall|paint|carpentr|window|door|siding|gutter|chimney|kitchen|bath)\b/.test(blob)
}

async function nearestZip(lat, lng) {
  const { data } = await supabase
    .from('zip_centroids')
    .select('zip, lat, lng')
    .gte('lat', lat - 0.5).lte('lat', lat + 0.5)
    .gte('lng', lng - 0.5).lte('lng', lng + 0.5)
  if (!data?.length) return null
  let best = null, bestDist = Infinity
  for (const c of data) {
    const d = Math.hypot(c.lat - lat, c.lng - lng)
    if (d < bestDist) { bestDist = d; best = c.zip }
  }
  return best
}

let candidates = 0
let inserted = 0
let dupes = 0
let skippedNoGeo = 0

for (const p of raw) {
  if (!classifyHandyman(p)) continue
  candidates++
  const lat = Number(p.latitude)
  const lng = Number(p.longitude)
  if (!isFinite(lat) || !isFinite(lng)) { skippedNoGeo++; continue }
  const zip = await nearestZip(lat, lng)
  if (!zip) { skippedNoGeo++; continue }

  const street = [p.street_number, p.street_direction, p.street_name].filter(Boolean).join(' ').trim()
  if (!street) continue

  const cost = Number(p.reported_cost || 0)
  let score = 65
  if (cost > 50000) score += 25
  else if (cost > 10000) score += 12
  else if (cost > 1000) score += 6
  if (p.issue_date) {
    const ageDays = (Date.now() - new Date(p.issue_date).getTime()) / 86400000
    if (ageDays < 14) score += 15
    else if (ageDays < 45) score += 8
  }
  score = Math.min(100, score)

  const pitch = `Recent ${(p.permit_type || 'permit').toLowerCase()} filed at this address — ${(p.work_description || 'home improvement work').slice(0,120)}. Door-knock or call this week while they're actively planning the project.`

  const { error } = await supabase.from('leads').insert({
    street_address: street,
    zip,
    city: 'Chicago',
    state: 'IL',
    source: 'permit',
    source_event_date: p.issue_date,
    source_details: {
      provider: 'chicago_socrata',
      permit_number: p.permit_ || p.id,
      permit_type: p.permit_type,
      work_description: p.work_description,
      reported_cost: cost,
    },
    lead_score: score,
    pitch_script: pitch,
    trade_match: ['handyman'],
  })
  if (!error) inserted++
  else if (error.code === '23505') dupes++
}

console.log(`\n✓ Done`)
console.log(`  candidates (handyman keywords): ${candidates}`)
console.log(`  inserted: ${inserted}`)
console.log(`  dupes: ${dupes}`)
console.log(`  skipped no geo: ${skippedNoGeo}`)

// Now re-fire lead engine for Peter's handyman profile
console.log(`\nRe-firing lead engine for Peter...`)
const { data: peter } = await supabase
  .from('profiles')
  .select('user_id, service_zips, business_type')
  .eq('business_type', 'handyman')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

if (!peter) { console.error('No active handyman profile found'); process.exit(0) }
console.log(`  user ${peter.user_id.slice(0,16)}... zips ${JSON.stringify(peter.service_zips)}`)

// Query for handyman leads in Peter's zip (or within radius)
const { data: nearby } = await supabase.rpc('zips_within_miles', {
  primary_zip: peter.service_zips[0],
  radius_mi: 50,
})
const zipPool = new Set([peter.service_zips[0]])
for (const z of nearby || []) if (z?.zip) zipPool.add(z.zip)

const { data: candidatesPool } = await supabase
  .from('leads')
  .select('id, lead_score')
  .contains('trade_match', ['handyman'])
  .in('zip', [...zipPool])
  .order('lead_score', { ascending: false })
  .limit(5)

console.log(`  handyman leads available in ${zipPool.size} zips: ${candidatesPool?.length || 0}`)

if (!candidatesPool?.length) { console.log('  no handyman leads to drop'); process.exit(0) }

const dropRows = candidatesPool.map((c) => ({
  user_id: peter.user_id,
  profile_id: peter.user_id,
  lead_id: c.id,
  drop_period: 'weekly',
  status: 'new',
}))
const { error: dropErr } = await supabase.from('lead_drops').insert(dropRows)
if (dropErr) { console.error('  drop insert failed:', dropErr.message); process.exit(1) }
console.log(`  ✓ dropped ${dropRows.length} handyman leads to Peter`)
console.log(`\nRefresh https://www.bellavego.com/dashboard/leads`)
