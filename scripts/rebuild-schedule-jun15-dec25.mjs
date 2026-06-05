#!/usr/bin/env node
/**
 * Rebuild data/scrape-schedule.json for the June 15 → Dec 25 push.
 *
 * Requirements (per Peter 2026-06-05):
 *   - Send 580/day Instantly every day from Jun 15 → Dec 25
 *   - Sustain volume regardless of young-pool depletion
 *   - Rotate Sun Belt cities so no city scraped twice in same week
 *
 * Math:
 *   580 send/day / ~0.66 email-hit rate = 879 scrape/day target
 *   Round to 900/day scrape (extra buffer for RDAP misses + DNC scrubs)
 *   900 / 3 cities/day = 300 shops/city/day
 *
 * 194 days × 900/day = 174,600 total scrape volume
 * Sun Belt cities total estimated shops = ~55,000
 * = 3 full passes through every Sun Belt city, each pass on UNIQUE shops
 *   (outreach_leads UNIQUE constraint on email auto-dedups)
 */

import fs from 'node:fs'

const SUN_BELT = [
  'Phoenix, AZ', 'Las Vegas, NV', 'Tucson, AZ', 'Mesa, AZ',
  'Dallas, TX', 'Houston, TX', 'Fort Worth, TX', 'Austin, TX', 'San Antonio, TX',
  'Tampa, FL', 'Orlando, FL', 'Jacksonville, FL', 'Miami, FL',
  'Atlanta, GA', 'Charlotte, NC', 'Raleigh, NC',
  'Nashville, TN', 'Memphis, TN', 'Birmingham, AL',
  'Oklahoma City, OK', 'Albuquerque, NM',
  'Fresno, CA', 'Sacramento, CA', 'Bakersfield, CA',
]
const CITIES_PER_DAY = 3
const SCRAPE_PER_DAY = 900
const SEND_PER_DAY = 580

function* dateRange(start, end) {
  for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) {
    yield d.toISOString().slice(0, 10)
  }
}

const schedule = []
let cityIdx = 0
for (const date of dateRange('2026-06-15', '2026-12-25')) {
  const cities = []
  for (let i = 0; i < CITIES_PER_DAY; i++) {
    cities.push(SUN_BELT[cityIdx % SUN_BELT.length])
    cityIdx++
  }
  schedule.push({
    date,
    send_target: SEND_PER_DAY,
    scrape_target: SCRAPE_PER_DAY,
    cities,
  })
}

// Load existing schedule + preserve pre-Jun15 history
const path = 'C:/Users/peter/ringoco/data/scrape-schedule.json'
const existing = JSON.parse(fs.readFileSync(path, 'utf8'))
const preserved = (existing.schedule || []).filter((d) => d.date < '2026-06-15')

const merged = {
  ...existing,
  '//volume': '50/day until Jun 14 (Gmail warm). 580/day Jun 15 → Dec 25 (Instantly young-pivot). 900/day scrape buffer.',
  '//pivot_2026-06-05': 'Schedule rewritten for young-owner ICP. Scrape 900/day across 3 Sun Belt cities, send 580/day to young-flagged leads only (young_owner_score >= 40).',
  schedule: [...preserved, ...schedule],
}
fs.writeFileSync(path, JSON.stringify(merged, null, 2), 'utf8')
console.log(`✓ Schedule rewritten`)
console.log(`  Preserved ${preserved.length} pre-Jun-15 entries`)
console.log(`  Added ${schedule.length} entries Jun 15 → Dec 25`)
console.log(`  Total scrape volume: ${schedule.length * SCRAPE_PER_DAY} = ${(schedule.length * SCRAPE_PER_DAY).toLocaleString()} shops`)
console.log(`  Total send volume:   ${schedule.length * SEND_PER_DAY} = ${(schedule.length * SEND_PER_DAY).toLocaleString()} emails`)
console.log(`  City rotations:      ${Math.floor(schedule.length * CITIES_PER_DAY / SUN_BELT.length)} full passes through Sun Belt`)
