#!/usr/bin/env node
/**
 * scrape-leads.mjs — Apify Google Maps scrape → CSV.
 *
 * Usage:
 *   APIFY_TOKEN=xxx node scripts/scrape-leads.mjs \
 *     --query "HVAC contractor" \
 *     --location "Las Vegas, NV" \
 *     --max 300 \
 *     --out leads/vegas-hvac-raw.csv
 *
 * Then pipe the output to enrich-leads.mjs to filter + Claude-enrich.
 */

import fs from 'fs'
import path from 'path'

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
const location = args.location || 'Las Vegas, NV'
const maxResults = parseInt(args.max || '300', 10)
const outPath = args.out || `leads/${location.toLowerCase().replace(/[, ]+/g, '-')}-${query.toLowerCase().replace(/[ ]+/g, '-')}-raw.csv`

console.log(`Scraping "${query}" in "${location}" (max ${maxResults} results) → ${outPath}`)

// Apify Google Maps scraper actor: compass/crawler-google-places
const ACTOR_ID = 'compass~crawler-google-places'

const input = {
  searchStringsArray: [query],
  locationQuery: location,
  maxCrawledPlacesPerSearch: maxResults,
  language: 'en',
  countryCode: 'us',
  exportPlaceUrls: false,
  includeWebResults: false,
  scrapePlaceDetailPage: false,
  scrapeTableReservationProvider: false,
  scrapeDirectories: false,
  maxQuestions: 0,
  scrapeReviewer: false,
  scrapeReviewerName: false,
  scrapeReviewerId: false,
  scrapeReviewerUrl: false,
  scrapeReviewId: false,
  scrapeReviewUrl: false,
  scrapeResponseFromOwnerText: false,
  reviewsSort: 'newest',
  reviewsOrigin: 'all',
  scrapeReviewsPersonalData: false,
}

console.log('Starting Apify run...')
const t0 = Date.now()

// Use run-sync-get-dataset-items so we get results back in one call.
// This blocks up to ~5 min — plenty for 300 places.
const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&clean=true&fields=title,categoryName,address,city,state,postalCode,phone,phoneUnformatted,website,totalScore,reviewsCount,permanentlyClosed,temporarilyClosed,placeId,url`

const res = await fetch(runUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(input),
})

if (!res.ok) {
  const text = await res.text()
  console.error(`Apify run failed (${res.status}):`, text.slice(0, 500))
  process.exit(1)
}

const items = await res.json()
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`Apify returned ${items.length} places in ${elapsed}s`)

if (items.length === 0) {
  console.warn('No results — check query / location spelling')
  process.exit(1)
}

// Write to CSV (header from first row's keys, then quoted CSV escape)
fs.mkdirSync(path.dirname(outPath), { recursive: true })

// Standard column order matching what enrich-leads.mjs expects from Apify export
const cols = [
  'title', 'categoryName', 'address', 'city', 'state', 'postalCode',
  'phone', 'phoneUnformatted', 'website', 'totalScore', 'reviewsCount',
  'permanentlyClosed', 'temporarilyClosed', 'placeId', 'url',
]

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

const lines = [cols.join(',')]
for (const item of items) {
  lines.push(cols.map((c) => csvEscape(item[c])).join(','))
}
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')

console.log(`Wrote ${items.length} rows to ${outPath}`)
console.log(`\nNext step: node scripts/enrich-leads.mjs ${outPath}`)
