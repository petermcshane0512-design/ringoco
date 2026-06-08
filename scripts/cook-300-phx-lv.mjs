#!/usr/bin/env node
/**
 * cook-300-phx-lv.mjs — Sunday-night cooker.
 *
 * Scrapes HVAC + Electrical small-shop leads in Phoenix metro + Vegas,
 * filters to top 300 by review-count and rating, imports to DB, then
 * outputs a Mon/Tue split master sheet ready for Peter + sales friend.
 *
 * Strategy:
 *   - PHX metro = 200 leads target (HVAC heavier than electrical)
 *   - LV       = 100 leads target
 *   - Each split into Mon and Tue, then between Peter and Friend
 *
 * USAGE
 *   node scripts/cook-300-phx-lv.mjs
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'

const STEPS = [
  // (trade query, city, max raw — over-scrape so filtering leaves enough)
  { query: 'HVAC contractor',  location: 'Phoenix, AZ',   max: 200, slug: 'phoenix-hvac' },
  { query: 'Electrician',      location: 'Phoenix, AZ',   max: 130, slug: 'phoenix-electrical' },
  { query: 'HVAC contractor',  location: 'Mesa, AZ',      max: 80,  slug: 'mesa-hvac' },
  { query: 'HVAC contractor',  location: 'Scottsdale, AZ',max: 60,  slug: 'scottsdale-hvac' },
  { query: 'HVAC contractor',  location: 'Las Vegas, NV', max: 130, slug: 'vegas-hvac' },
  { query: 'Electrician',      location: 'Las Vegas, NV', max: 80,  slug: 'vegas-electrical' },
]

const DATE = new Date().toISOString().slice(0, 10)
const ROOT = 'C:\\Users\\peter\\ringoco\\leads'

console.log(`\n╔══════════════════════════════════════════════════════════════╗`)
console.log(`║ Cook 300 PHX+LV — ${DATE}                                  ║`)
console.log(`╚══════════════════════════════════════════════════════════════╝\n`)

const allCsvs = []
for (const s of STEPS) {
  const out = `${ROOT}\\${s.slug}-${DATE}-raw.csv`
  console.log(`▶ Scraping ${s.query} in ${s.location} (max ${s.max})`)
  try {
    execSync(
      `node C:\\Users\\peter\\ringoco\\scripts\\scrape-leads.mjs --query "${s.query}" --location "${s.location}" --max ${s.max} --out "${out}"`,
      { stdio: 'inherit', env: process.env },
    )
    if (fs.existsSync(out)) allCsvs.push({ path: out, trade: s.query.toLowerCase().includes('hvac') ? 'HVAC' : 'Electrical', city: s.location.split(',')[0].trim() })
  } catch (e) {
    console.warn(`  ⚠ scrape failed: ${e.message}`)
  }
}

console.log(`\n📦 ${allCsvs.length}/${STEPS.length} scrapes complete\n`)

// Use simpler in-process filter rather than enrich-leads.mjs (we already have
// review_count from the Apify result — no need for Claude tier classifier).
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const allLeads = []
for (const csv of allCsvs) {
  const rows = parse(fs.readFileSync(csv.path, 'utf8'), { columns: true, skip_empty_lines: true, trim: true })
  for (const r of rows) {
    const reviews = parseInt(r.reviewsCount || r.totalScore_reviews || '0', 10)
    const rating = parseFloat(r.totalScore || r.rating || '0')
    const phone = (r.phone || r.phoneUnformatted || '').trim()
    const title = (r.title || r.name || '').trim()
    const website = (r.website || '').trim()
    const placeId = (r.placeId || '').trim()
    const closed = (r.permanentlyClosed || '').toLowerCase() === 'true' || (r.temporarilyClosed || '').toLowerCase() === 'true'

    // FILTER: small-dog ICP
    if (closed) continue
    if (!phone) continue                                 // need phone to call
    if (!title) continue
    if (reviews < 5 || reviews > 60) continue            // 1-5 employee proxy
    if (rating < 4.2) continue                            // quality bar
    if (!website) continue                                // no website = likely zombie listing
    if (title.length > 80 || /\/\/|http|map/i.test(title)) continue  // junk title

    allLeads.push({
      trade: csv.trade,
      city: csv.city,
      business_name: title,
      phone,
      website,
      reviews,
      rating,
      address: r.address || '',
      zip: r.postalCode || '',
      state: r.state || '',
      placeId,
      url: r.url || '',
      score: computeScore(reviews, rating),
    })
  }
}

console.log(`\n📋 ${allLeads.length} leads passed small-dog filter`)

// Dedupe by placeId or business+phone
const seen = new Set()
const unique = []
for (const l of allLeads) {
  const k = l.placeId || `${l.business_name.toLowerCase()}|${l.phone}`
  if (seen.has(k)) continue
  seen.add(k)
  unique.push(l)
}
console.log(`🔄 ${unique.length} unique after dedup`)

// Sort by score desc, then pick top 300 with city quota
unique.sort((a, b) => b.score - a.score)
const phxLimit = 200
const lvLimit = 100
const phx = []
const lv = []
for (const l of unique) {
  const isPhx = ['Phoenix', 'Mesa', 'Scottsdale'].includes(l.city)
  const isLv = l.city === 'Las Vegas'
  if (isPhx && phx.length < phxLimit) phx.push(l)
  else if (isLv && lv.length < lvLimit) lv.push(l)
  if (phx.length >= phxLimit && lv.length >= lvLimit) break
}
const picked = [...phx, ...lv]
console.log(`🎯 Picked: ${phx.length} PHX metro + ${lv.length} LV = ${picked.length} total\n`)

// Mon/Tue split, then Peter/Friend
const half = Math.ceil(picked.length / 2)
const mon = picked.slice(0, half)
const tue = picked.slice(half)
const monPeter = mon.filter((_, i) => i % 2 === 0)
const monFriend = mon.filter((_, i) => i % 2 === 1)
const tuePeter = tue.filter((_, i) => i % 2 === 0)
const tueFriend = tue.filter((_, i) => i % 2 === 1)

console.log(`📅 Mon: ${mon.length} (Peter ${monPeter.length}, Friend ${monFriend.length})`)
console.log(`📅 Tue: ${tue.length} (Peter ${tuePeter.length}, Friend ${tueFriend.length})\n`)

// Import to outreach_leads with day + caller tag
const today = new Date().toISOString().slice(0, 10)
let imported = 0
for (const [batch, day, caller] of [
  [monPeter, 'Mon', 'Peter'],
  [monFriend, 'Mon', 'Friend'],
  [tuePeter, 'Tue', 'Peter'],
  [tueFriend, 'Tue', 'Friend'],
]) {
  for (const l of batch) {
    const { error } = await supabase
      .from('outreach_leads')
      .upsert({
        business_name: l.business_name,
        owner_phone: l.phone,
        city: l.city,
        state: l.state,
        trade: l.trade,
        trade_normalized: l.trade,
        campaign_id: `cook-300-${today}-${day}-${caller}`,
        status: 'queued',
        notes: `${day} batch · ${caller} call · score ${l.score.toFixed(1)} · ${l.reviews} reviews ${l.rating}★`,
        pushed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'business_name', ignoreDuplicates: false })
    if (!error) imported++
  }
}
console.log(`💾 Imported ${imported} leads to outreach_leads\n`)

// Save Mon/Tue master sheet pack
const sheetPath = `${ROOT}\\cook-300-mon-tue.json`
fs.writeFileSync(sheetPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  monday: { peter: monPeter, friend: monFriend },
  tuesday: { peter: tuePeter, friend: tueFriend },
  total: picked.length,
}, null, 2))
console.log(`💾 ${sheetPath}\n`)

console.log(`\n╔══════════════════════════════════════════════════════════════╗`)
console.log(`║ ✅ 300 leads cooked + queued                                 ║`)
console.log(`╚══════════════════════════════════════════════════════════════╝`)
console.log(`Next: run export-300-master-sheet.mjs to generate Excel + pre-cache reports`)


function computeScore(reviews, rating) {
  // Score weights: rating heavily, then review velocity in sweet spot
  // 5-25 reviews = strong owner-operator signal
  // 26-50 = small team
  // 51-60 = approaching receptionist territory
  const reviewBonus = reviews >= 5 && reviews <= 25 ? 2.0 :
                     reviews >= 26 && reviews <= 50 ? 1.5 :
                     0.8
  return (rating * 1.6) + reviewBonus  // max ~10
}
