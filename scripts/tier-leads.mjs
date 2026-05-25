#!/usr/bin/env node
/**
 * tier-leads.mjs — filter + tier a raw Apify CSV without needing Claude.
 *
 * Faster, simpler cousin of enrich-leads.mjs. Use when you just need a
 * dialing list NOW and don't have ANTHROPIC_API_KEY handy.
 *
 * Usage: node scripts/tier-leads.mjs leads/vegas-hvac-raw.csv
 *
 * Filters out: closed, no phone, national chains, >500 reviews,
 * <4.0 rating, <10 reviews. Tiers survivors A/B/C by composite score.
 *
 * Outputs:
 *   {basename}-tier-all.csv  (all survivors, ranked)
 *   {basename}-tier-a.csv    (just Tier A — dial first)
 */

import fs from 'fs'
import path from 'path'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node scripts/tier-leads.mjs <input.csv>')
  process.exit(1)
}

// Parse CSV (handles quoted fields with commas/newlines/escaped quotes)
function parseCSV(text) {
  const rows = []
  let cur = []
  let val = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { val += '"'; i++ } else { inQuotes = false }
      } else { val += ch }
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { cur.push(val); val = '' }
      else if (ch === '\n') { cur.push(val); rows.push(cur); cur = []; val = '' }
      else if (ch === '\r') { /* skip */ }
      else val += ch
    }
  }
  if (val !== '' || cur.length > 0) { cur.push(val); rows.push(cur) }
  return rows
}

const text = fs.readFileSync(inputPath, 'utf8')
const rows = parseCSV(text)
const header = rows[0]
const dataRows = rows.slice(1).filter((r) => r.length === header.length)

console.log(`Loaded ${dataRows.length} rows from ${inputPath}`)

const col = (name) => header.indexOf(name)
const idx = {
  title: col('title'),
  categoryName: col('categoryName'),
  address: col('address'),
  city: col('city'),
  state: col('state'),
  phone: col('phone'),
  phoneUnformatted: col('phoneUnformatted'),
  website: col('website'),
  totalScore: col('totalScore'),
  reviewsCount: col('reviewsCount'),
  permanentlyClosed: col('permanentlyClosed'),
  temporarilyClosed: col('temporarilyClosed'),
}

// National chains / franchises to exclude
const CHAINS = [
  'one hour', 'horizon services', 'roto-rooter', 'mr. rooter', 'mister rooter',
  'arsonic', 'arsonic air', 'aire serv', 'service experts', 'goettl',
  'george brazil', 'parker & sons', 'parker and sons', 'larson', 'morris-jenkins',
  'dixie', 'sun devil', 'arctic', 'arctic fox', 'home depot', 'lowes', "lowe's",
  'sears', 'angi', 'thumbtack',
]

function isChain(title) {
  const t = (title || '').toLowerCase()
  return CHAINS.some((c) => t.includes(c))
}

const filtered = []
const filterStats = {
  permanently_closed: 0,
  temporarily_closed: 0,
  no_phone: 0,
  chain: 0,
  too_many_reviews: 0,
  rating_too_low: 0,
  too_few_reviews: 0,
}

for (const r of dataRows) {
  const title = r[idx.title]
  const phone = r[idx.phone] || r[idx.phoneUnformatted]
  const rating = parseFloat(r[idx.totalScore]) || 0
  const reviews = parseInt(r[idx.reviewsCount], 10) || 0
  const permClosed = r[idx.permanentlyClosed] === 'true'
  const tempClosed = r[idx.temporarilyClosed] === 'true'

  if (permClosed) { filterStats.permanently_closed++; continue }
  if (tempClosed) { filterStats.temporarily_closed++; continue }
  if (!phone) { filterStats.no_phone++; continue }
  if (isChain(title)) { filterStats.chain++; continue }
  if (reviews > 500) { filterStats.too_many_reviews++; continue }
  if (rating < 4.0) { filterStats.rating_too_low++; continue }
  if (reviews < 10) { filterStats.too_few_reviews++; continue }

  filtered.push(r)
}

console.log(`\nFilter breakdown:`)
for (const [k, v] of Object.entries(filterStats)) {
  console.log(`  ${k}: ${v}`)
}
console.log(`  → SURVIVORS: ${filtered.length}`)

// Score = rating × log(reviews) × (has website ? 1.2 : 0.9)
// Rewards 4.5-5.0 rating, mid-range review counts (30-300), website presence.
function score(r) {
  const rating = parseFloat(r[idx.totalScore]) || 0
  const reviews = parseInt(r[idx.reviewsCount], 10) || 0
  const hasWebsite = !!r[idx.website]
  return rating * Math.log10(reviews + 1) * (hasWebsite ? 1.2 : 0.9)
}

filtered.sort((a, b) => score(b) - score(a))

// Tier: top 100 = A, next 100 = B, rest = C
const TIER_A_CUTOFF = 100
const TIER_B_CUTOFF = 200

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

const outCols = ['tier', 'rank', 'score', 'title', 'phone', 'website', 'address', 'city', 'state', 'totalScore', 'reviewsCount']
const outAll = [outCols.join(',')]
const outA = [outCols.join(',')]

filtered.forEach((r, i) => {
  const tier = i < TIER_A_CUTOFF ? 'A' : i < TIER_B_CUTOFF ? 'B' : 'C'
  const scoreVal = score(r).toFixed(2)
  const row = [
    tier,
    i + 1,
    scoreVal,
    r[idx.title],
    r[idx.phone] || r[idx.phoneUnformatted],
    r[idx.website],
    r[idx.address],
    r[idx.city],
    r[idx.state],
    r[idx.totalScore],
    r[idx.reviewsCount],
  ].map(csvEscape).join(',')
  outAll.push(row)
  if (tier === 'A') outA.push(row)
})

const base = inputPath.replace(/-raw\.csv$/, '').replace(/\.csv$/, '')
const allPath = `${base}-tier-all.csv`
const aPath = `${base}-tier-a.csv`

fs.writeFileSync(allPath, outAll.join('\n') + '\n', 'utf8')
fs.writeFileSync(aPath, outA.join('\n') + '\n', 'utf8')

console.log(`\n✓ Wrote ${outAll.length - 1} rows to ${allPath}`)
console.log(`✓ Wrote ${outA.length - 1} Tier A rows to ${aPath} ← DIAL THIS FIRST`)
