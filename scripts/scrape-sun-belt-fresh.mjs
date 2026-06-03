#!/usr/bin/env node
/**
 * scrape-sun-belt-fresh.mjs
 *
 * Sun Belt HVAC scraper. Hard ICP filter ≤50 reviews (Peter's spec 6/2).
 * Dedups against outreach_leads.email AND business_name+city — so a shop
 * already touched in ANY metro doesn't slip through under a different city
 * label. Tommy/Le/Peter NEVER dial a repeat.
 *
 * Cities:
 *   Vegas + Henderson, Tampa + Orlando, Houston + Dallas + Austin +
 *   San Antonio, Atlanta, Jacksonville, Miami.
 *
 * Output:
 *   1. leads/sun-belt-fresh-{date}.xlsx (sorted by score, for dialing)
 *   2. outreach_leads INSERT with status='queued' (auto-load picks up later)
 *
 * Uses Apify Google Maps actor — already paid budget, ~$5/1k results.
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const APIFY_TOKEN = process.env.APIFY_API_TOKEN
if (!APIFY_TOKEN) throw new Error('APIFY_API_TOKEN missing')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// Tight to Sun Belt summer HVAC pain zone. Skip northern.
const TARGETS = [
  // AZ metro filled — skip
  { city: 'Las Vegas', state: 'NV' },
  { city: 'Henderson', state: 'NV' },
  { city: 'North Las Vegas', state: 'NV' },
  { city: 'Tampa', state: 'FL' },
  { city: 'Orlando', state: 'FL' },
  { city: 'Jacksonville', state: 'FL' },
  { city: 'Miami', state: 'FL' },
  { city: 'Fort Lauderdale', state: 'FL' },
  { city: 'Houston', state: 'TX' },
  { city: 'Dallas', state: 'TX' },
  { city: 'Fort Worth', state: 'TX' },
  { city: 'Austin', state: 'TX' },
  { city: 'San Antonio', state: 'TX' },
  { city: 'Atlanta', state: 'GA' },
]

const MAX_REVIEWS = 50
const MIN_REVIEWS = 3 // below 3 = sketchy / inactive / fake
const PER_CITY_LIMIT = 60 // raw scrape count, will dedup down

async function runApifyGoogleMaps(query) {
  const run = await fetch(
    `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: PER_CITY_LIMIT,
        language: 'en',
        searchMatching: 'all',
      }),
    },
  )
  const runJson = await run.json()
  const runId = runJson?.data?.id
  if (!runId) throw new Error(`Apify start failed: ${JSON.stringify(runJson).slice(0, 200)}`)

  // Poll until done
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    const statusR = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
    )
    const statusJ = await statusR.json()
    const st = statusJ?.data?.status
    if (st === 'SUCCEEDED') break
    if (st === 'FAILED' || st === 'ABORTED' || st === 'TIMED-OUT')
      throw new Error(`Apify run ${st}`)
  }

  const datasetR = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}&format=json&clean=1`,
  )
  return await datasetR.json()
}

// Load EVERY existing outreach_leads email + (business+city) for dedup. One query.
console.log('Loading existing leads for dedup...')
const dedupEmails = new Set()
const dedupBizCity = new Set()
let offset = 0
const BATCH = 1000
while (true) {
  const { data, error } = await supabase
    .from('outreach_leads')
    .select('email, business_name, city')
    .range(offset, offset + BATCH - 1)
  if (error) {
    console.error('dedup query err:', error.message)
    break
  }
  if (!data || data.length === 0) break
  for (const r of data) {
    if (r.email) dedupEmails.add(r.email.toLowerCase().trim())
    if (r.business_name && r.city) {
      dedupBizCity.add(
        `${r.business_name.toLowerCase().trim()}|${r.city.toLowerCase().trim()}`,
      )
    }
  }
  if (data.length < BATCH) break
  offset += BATCH
}
console.log(`  ${dedupEmails.size} emails, ${dedupBizCity.size} biz+city pairs in dedup set`)

const allFresh = []
for (const t of TARGETS) {
  const query = `HVAC ${t.city} ${t.state}`
  console.log(`\nScraping: ${query}`)
  let raw = []
  try {
    raw = await runApifyGoogleMaps(query)
  } catch (e) {
    console.error(`  ❌ ${query}: ${e.message}`)
    continue
  }
  console.log(`  raw: ${raw.length}`)

  let icpFiltered = 0
  let dupedEmail = 0
  let dupedBiz = 0
  let noEmail = 0
  let added = 0

  for (const r of raw) {
    const title = r.title || r.name || ''
    const reviewCount = r.reviewsCount ?? r.reviews ?? 0
    const email =
      r.email ||
      (Array.isArray(r.emails) && r.emails[0]) ||
      r.contactEmail ||
      null
    const phone = r.phone || r.phoneUnformatted || r.contactPhone || null
    const website = r.website || r.url || null
    const cityClean = (r.city || t.city).trim()

    // ICP filter
    if (reviewCount < MIN_REVIEWS || reviewCount > MAX_REVIEWS) {
      icpFiltered++
      continue
    }
    if (!email) {
      noEmail++
      // still useful for phone — track separately
    }

    const emailLower = email?.toLowerCase().trim()
    const bizCityKey = `${title.toLowerCase().trim()}|${cityClean.toLowerCase()}`

    if (emailLower && dedupEmails.has(emailLower)) {
      dupedEmail++
      continue
    }
    if (dedupBizCity.has(bizCityKey)) {
      dupedBiz++
      continue
    }

    allFresh.push({
      business_name: title,
      email: emailLower || null,
      phone,
      website,
      city: cityClean,
      state: t.state,
      trade: 'HVAC',
      review_count: reviewCount,
      rating: r.totalScore ?? r.rating ?? null,
      address: r.address || r.street || null,
      source: 'sun-belt-fresh-2026-06-02',
    })
    if (emailLower) dedupEmails.add(emailLower)
    dedupBizCity.add(bizCityKey)
    added++
  }
  console.log(
    `  ICP-rejected: ${icpFiltered} · already-emailed: ${dupedEmail} · already-biz: ${dupedBiz} · no-email: ${noEmail} · NEW: ${added}`,
  )
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`  TOTAL FRESH LEADS: ${allFresh.length}`)
console.log(`  With email:        ${allFresh.filter((l) => l.email).length}`)
console.log(`  Phone-only:        ${allFresh.filter((l) => !l.email && l.phone).length}`)

// Insert phone-only + emailed leads to outreach_leads (status=queued)
console.log(`\nInserting to outreach_leads...`)
const insertRows = allFresh.map((l) => ({
  email: l.email,
  business_name: l.business_name,
  owner_first_name: null,
  owner_phone: l.phone,
  city: l.city,
  state: l.state,
  trade: l.trade,
  status: 'queued',
  source: l.source,
  review_count: l.review_count,
  website: l.website,
}))

let inserted = 0
for (let i = 0; i < insertRows.length; i += 100) {
  const batch = insertRows.slice(i, i + 100)
  const { error } = await supabase.from('outreach_leads').insert(batch)
  if (error) {
    console.warn(`  batch ${i / 100} insert err: ${error.message.slice(0, 120)}`)
  } else {
    inserted += batch.length
  }
}
console.log(`  Inserted: ${inserted}`)

// Build xlsx for Peter to dial — phone-priority + email-priority
const wb = new ExcelJS.Workbook()
wb.creator = 'BellAveGo Scraper'
wb.created = new Date()

const ws = wb.addWorksheet('Sun Belt HVAC Fresh', {
  views: [{ state: 'frozen', ySplit: 1 }],
})
ws.columns = [
  { header: 'Business', key: 'business_name', width: 36 },
  { header: 'Phone', key: 'phone', width: 16 },
  { header: 'City', key: 'city', width: 14 },
  { header: 'State', key: 'state', width: 6 },
  { header: '⭐', key: 'rating', width: 6 },
  { header: '# Reviews', key: 'review_count', width: 10 },
  { header: 'Email', key: 'email', width: 36 },
  { header: 'Website', key: 'website', width: 32 },
  { header: 'Address', key: 'address', width: 40 },
]
ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0AA89F' } }

// Sort: phone-having first, then by review count ASC (smallest dogs first)
const sorted = [...allFresh].sort((a, b) => {
  if (!!a.phone !== !!b.phone) return a.phone ? -1 : 1
  return (a.review_count || 0) - (b.review_count || 0)
})
for (const l of sorted) {
  ws.addRow(l)
}

const today = new Date().toISOString().slice(0, 10)
const OUT = `C:\\Users\\peter\\ringoco\\leads\\sun-belt-fresh-${today}.xlsx`
await wb.xlsx.writeFile(OUT)

// Mirror to OneDrive
const ONEDRIVE = `C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads\\sun-belt-fresh-${today}.xlsx`
try {
  fs.copyFileSync(OUT, ONEDRIVE)
} catch (e) {
  console.warn('OneDrive mirror failed: ' + e.message)
}

console.log(`\n  xlsx: ${OUT}`)
console.log(`  OneDrive: ${ONEDRIVE}`)
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
