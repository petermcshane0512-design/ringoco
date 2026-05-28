#!/usr/bin/env node
/**
 * scrape-leads-and-emails.mjs — combined scrape + email extraction in ONE
 * Apify actor pass. Uses lukaskrivka/google-maps-with-contact-details
 * which is purpose-built for HVAC-style B2B lead gen: scrapes Google
 * Maps shops + crawls each website + extracts emails/phones/socials.
 *
 * Claimed extraction rate: 60-75% (vs 25% with the generic vdrmota actor).
 *
 * USAGE
 *   node scripts/scrape-leads-and-emails.mjs --query "HVAC contractor" --location "Dallas, TX" --max 200 --out leads/dallas.csv
 *
 * COST
 *   ~$0.015 per result (slightly more than basic scrape since it does both
 *   maps + website crawl). 200 results = ~$3.
 *
 * ENV
 *   APIFY_TOKEN
 */

import fs from 'node:fs'
import path from 'node:path'
import { stringify } from 'csv-stringify/sync'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const APIFY_TOKEN = process.env.APIFY_TOKEN
if (!APIFY_TOKEN) {
  console.error('FATAL: APIFY_TOKEN env var missing')
  process.exit(1)
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, val, i, arr) => {
    if (val.startsWith('--')) acc.push([val.slice(2), arr[i + 1]])
    return acc
  }, []),
)

const query = args.query || 'HVAC contractor'
const location = args.location || 'Dallas, TX'
const maxResults = parseInt(args.max || '200', 10)
const outPath = args.out || `leads/${location.toLowerCase().replace(/[, ]+/g, '-')}-${query.toLowerCase().replace(/[ ]+/g, '-')}-with-emails.csv`

console.log(`🚀 Combined scrape+email for "${query}" in "${location}" (max ${maxResults})`)

// Actor: lukaskrivka/google-maps-with-contact-details
// Does Google Maps scrape AND visits each website to extract contact details.
const ACTOR_ID = 'lukaskrivka~google-maps-with-contact-details'

const input = {
  searchStringsArray: [query],
  locationQuery: location,
  maxCrawledPlacesPerSearch: maxResults,
  language: 'en',
  countryCode: 'us',
  // Tell the actor to follow each shop's website for emails
  scrapeContacts: true,
  maxContactScrapeRequests: 5,  // homepage + up to 4 deep links per site
}

// Start the run async (sync endpoint has 5-min cap, this needs longer)
console.log('▶ Starting Apify run...')
const t0 = Date.now()
const startRes = await fetch(
  `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
)
if (!startRes.ok) {
  console.error(`start failed (${startRes.status}):`, (await startRes.text()).slice(0, 500))
  process.exit(1)
}
const { data: { id: runId, defaultDatasetId: datasetId } } = await startRes.json()
console.log(`   runId=${runId} datasetId=${datasetId} — polling`)

// Poll status (this actor can take 5-15 min on 200 sites)
let status = 'RUNNING'
let polls = 0
const POLL = 10000
const MAX_WAIT = 25 * 60 * 1000
while (Date.now() - t0 < MAX_WAIT) {
  await new Promise((r) => setTimeout(r, POLL))
  const sr = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`)
  if (!sr.ok) continue
  status = (await sr.json())?.data?.status
  polls++
  if (polls % 3 === 0) console.log(`   [${Math.round((Date.now() - t0) / 1000)}s] ${status}`)
  if (['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(status)) break
}
if (status !== 'SUCCEEDED') {
  console.error(`Apify run ended ${status}`)
  process.exit(1)
}

// Pull dataset
const dr = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true`)
const items = await dr.json()
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`✅ ${items.length} places in ${elapsed}s`)

// Normalize to the same column shape our pipeline expects.
const rows = items.map((p) => ({
  business_name: p.title || p.name || '',
  phone: p.phone || p.phoneUnformatted || '',
  website: p.website || '',
  city: p.city || '',
  state: p.state || '',
  postalCode: p.postalCode || p.zip || '',
  address: p.address || '',
  rating: p.totalScore ?? p.rating ?? '',
  reviews: p.reviewsCount ?? p.user_ratings_total ?? '',
  categories: p.categoryName || (Array.isArray(p.categories) ? p.categories[0] : '') || '',
  google_place_id: p.placeId || '',
  email: (p.emails || [])[0] || '',
  all_emails: (p.emails || []).join('|'),
  linkedin: (p.linkedIns || [])[0] || '',
  facebook: (p.facebooks || [])[0] || '',
  instagram: (p.instagrams || [])[0] || '',
}))

const withEmail = rows.filter((r) => r.email && r.email.includes('@'))
const rate = rows.length > 0 ? Math.round((withEmail.length / rows.length) * 100) : 0
console.log(`📧 ${withEmail.length}/${rows.length} have email (${rate}%) ← this is the metric to beat`)

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(
  outPath,
  stringify(rows, {
    header: true,
    columns: ['business_name', 'phone', 'website', 'city', 'state', 'postalCode', 'address', 'rating', 'reviews', 'categories', 'google_place_id', 'email', 'all_emails', 'linkedin', 'facebook', 'instagram'],
  }),
)
console.log(`📁 ${outPath}`)

if (rate < 50) {
  console.log(`\n⚠ Extraction rate ${rate}% below 50% — consider adding Hunter.io fallback for misses`)
}
