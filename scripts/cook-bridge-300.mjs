#!/usr/bin/env node
/**
 * cook-bridge-300.mjs — bridges the 173 from first run to 300 by:
 *   1. Re-reading existing raw CSVs with relaxed filter (4.0 rating)
 *   2. Scraping 2 more cities (Chandler HVAC, Henderson NV HVAC)
 *   3. Combining + dedup → top 300
 *   4. Fixed DB import (raw INSERT, no broken upsert)
 *   5. Mon/Tue split master sheet (JSON + Excel-ready)
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const DATE = '2026-05-31'
const ROOT = 'C:\\Users\\peter\\ringoco\\leads'

// Step 1 — scrape the 2 extra cities
const EXTRA = [
  { query: 'HVAC contractor', location: 'Chandler, AZ',  max: 80, slug: 'chandler-hvac' },
  { query: 'HVAC contractor', location: 'Henderson, NV', max: 60, slug: 'henderson-hvac' },
]
for (const s of EXTRA) {
  const out = `${ROOT}\\${s.slug}-${DATE}-raw.csv`
  if (fs.existsSync(out)) { console.log(`✓ ${s.slug} already scraped`); continue }
  console.log(`▶ Scrape ${s.query} in ${s.location} (max ${s.max})`)
  try {
    execSync(
      `node C:\\Users\\peter\\ringoco\\scripts\\scrape-leads.mjs --query "${s.query}" --location "${s.location}" --max ${s.max} --out "${out}"`,
      { stdio: 'inherit', env: process.env },
    )
  } catch (e) {
    console.warn(`  ⚠ ${s.slug} failed: ${e.message}`)
  }
}

// Step 2 — collect ALL raw CSVs (originals + extras) and re-filter w/ RELAXED bar
const CSV_LIST = [
  { f: `phoenix-hvac-${DATE}-raw.csv`,        trade: 'HVAC',       city: 'Phoenix' },
  { f: `phoenix-electrical-${DATE}-raw.csv`,  trade: 'Electrical', city: 'Phoenix' },
  { f: `mesa-hvac-${DATE}-raw.csv`,           trade: 'HVAC',       city: 'Mesa' },
  { f: `scottsdale-hvac-${DATE}-raw.csv`,     trade: 'HVAC',       city: 'Scottsdale' },
  { f: `vegas-hvac-${DATE}-raw.csv`,          trade: 'HVAC',       city: 'Las Vegas' },
  { f: `vegas-electrical-${DATE}-raw.csv`,    trade: 'Electrical', city: 'Las Vegas' },
  { f: `chandler-hvac-${DATE}-raw.csv`,       trade: 'HVAC',       city: 'Chandler' },
  { f: `henderson-hvac-${DATE}-raw.csv`,      trade: 'HVAC',       city: 'Henderson' },
]

const allLeads = []
for (const c of CSV_LIST) {
  const fp = `${ROOT}\\${c.f}`
  if (!fs.existsSync(fp)) continue
  const rows = parse(fs.readFileSync(fp, 'utf8'), { columns: true, skip_empty_lines: true, trim: true })
  for (const r of rows) {
    const reviews = parseInt(r.reviewsCount || '0', 10)
    const rating = parseFloat(r.totalScore || '0')
    const phone = (r.phone || r.phoneUnformatted || '').trim()
    const title = (r.title || '').trim()
    const website = (r.website || '').trim()
    const placeId = (r.placeId || '').trim()
    const closed = (r.permanentlyClosed || '').toLowerCase() === 'true' ||
                   (r.temporarilyClosed || '').toLowerCase() === 'true'

    // RELAXED filter — 4.0 instead of 4.2, website optional (still skip if no phone)
    if (closed) continue
    if (!phone) continue
    if (!title) continue
    if (reviews < 5 || reviews > 60) continue
    if (rating < 4.0) continue
    if (title.length > 80 || /\/\/|http|map/i.test(title)) continue

    allLeads.push({
      trade: c.trade, city: c.city,
      business_name: title, phone, website,
      reviews, rating,
      address: r.address || '', zip: r.postalCode || '', state: r.state || '',
      placeId, url: r.url || '',
      score: computeScore(reviews, rating, !!website),
    })
  }
}

console.log(`\n📋 ${allLeads.length} leads passed relaxed filter (4.0+ rating)`)

const seen = new Set()
const unique = []
for (const l of allLeads) {
  const k = l.placeId || `${l.business_name.toLowerCase()}|${l.phone}`
  if (seen.has(k)) continue
  seen.add(k)
  unique.push(l)
}
console.log(`🔄 ${unique.length} unique\n`)

// Sort by score, distribute by city quotas
unique.sort((a, b) => b.score - a.score)
const phxCities = ['Phoenix', 'Mesa', 'Scottsdale', 'Chandler']
const lvCities = ['Las Vegas', 'Henderson']
const phx = unique.filter(l => phxCities.includes(l.city)).slice(0, 200)
const lv = unique.filter(l => lvCities.includes(l.city)).slice(0, 100)
const picked = [...phx, ...lv]
console.log(`🎯 ${phx.length} PHX metro + ${lv.length} LV = ${picked.length} total\n`)

// Step 3 — Mon/Tue split, Peter/Friend alternate
const half = Math.ceil(picked.length / 2)
const mon = picked.slice(0, half)
const tue = picked.slice(half)
const monPeter = mon.filter((_, i) => i % 2 === 0)
const monFriend = mon.filter((_, i) => i % 2 === 1)
const tuePeter = tue.filter((_, i) => i % 2 === 0)
const tueFriend = tue.filter((_, i) => i % 2 === 1)

console.log(`📅 Mon: ${mon.length} (P${monPeter.length} / F${monFriend.length})`)
console.log(`📅 Tue: ${tue.length} (P${tuePeter.length} / F${tueFriend.length})\n`)

// Step 4 — IMPORT TO DB (fixed: use plain INSERT, dedup against existing first)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

// Get existing business names in DB to skip dupes
const { data: existing } = await supabase
  .from('outreach_leads')
  .select('business_name')
  .limit(50000)
const existingNames = new Set((existing ?? []).map(r => (r.business_name || '').toLowerCase().trim()))
console.log(`📊 DB has ${existingNames.size} existing names\n`)

let imported = 0
let skipped = 0
for (const [batch, day, caller] of [
  [monPeter, 'Mon', 'Peter'],
  [monFriend, 'Mon', 'Friend'],
  [tuePeter, 'Tue', 'Peter'],
  [tueFriend, 'Tue', 'Friend'],
]) {
  for (const l of batch) {
    if (existingNames.has(l.business_name.toLowerCase().trim())) { skipped++; continue }
    // INSERT only (NULL email is fine — unique constraint is on email, NULLs allowed)
    const { error } = await supabase
      .from('outreach_leads')
      .insert({
        business_name: l.business_name,
        owner_phone: l.phone,
        city: l.city,
        state: l.state,
        trade: l.trade,
        trade_normalized: l.trade,
        campaign_id: `cook-300-${DATE}-${day}-${caller}`,
        status: 'queued',
        notes: `${day} batch · ${caller} call · score ${l.score.toFixed(1)} · ${l.reviews} reviews ${l.rating}★ · ${l.website || 'no site'}`,
        pushed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    if (!error) imported++
    else if (!error.message?.includes('duplicate')) console.warn('  insert err:', error.message?.slice(0, 80))
  }
}
console.log(`💾 Imported ${imported} new (skipped ${skipped} dupes)\n`)

const sheetPath = `${ROOT}\\cook-300-final-mon-tue.json`
fs.writeFileSync(sheetPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  total: picked.length,
  monday: { peter: monPeter, friend: monFriend },
  tuesday: { peter: tuePeter, friend: tueFriend },
}, null, 2))
console.log(`💾 ${sheetPath}\n`)
console.log('═════════════════════════════════════════')
console.log(`✅ Final: ${picked.length} leads ready for Mon-Tue`)
console.log('═════════════════════════════════════════')

function computeScore(reviews, rating, hasWebsite) {
  const reviewBonus = reviews >= 5 && reviews <= 25 ? 2.0 :
                     reviews >= 26 && reviews <= 50 ? 1.5 : 0.8
  const websiteBonus = hasWebsite ? 0.5 : 0
  return (rating * 1.6) + reviewBonus + websiteBonus
}
