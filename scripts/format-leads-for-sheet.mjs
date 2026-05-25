#!/usr/bin/env node
/**
 * format-leads-for-sheet.mjs — convert a raw Apify CSV into the
 * "lead-sheet append" format Peter uses for his sales reps.
 *
 * Output schema (18 cols, in this exact order):
 *   rank, tier, Called, Signed Up, business_name, phone, website,
 *   city, state, rating, reviews, categories, recommended_plan,
 *   summary, why_they_need_bellavego, pitch_hook, google_place_id,
 *   address
 *
 * Conventions matched to leads/arizona-hvac-top-100.csv:
 *   - phone digits-only with +1 prefix
 *   - website = "(none)" when blank
 *   - summary lowercase, comma-separated, uses · and ★
 *   - pitch_hook uses em dashes (—), not hyphens
 *   - Called + Signed Up always FALSE
 *
 * Tier + plan rules from Peter's spec:
 *   200+ reviews → Tier A, Pro $497
 *   50-199 reviews → Tier B, Growth $297
 *   10-49 reviews → Tier C, Starter $147
 *
 * Usage:
 *   node scripts/format-leads-for-sheet.mjs \
 *     --in leads/vegas-hvac-raw.csv \
 *     --out leads/vegas-hvac-append.csv \
 *     --start-rank 101 \
 *     --dedupe-against leads/arizona-hvac-top-100.csv
 */

import fs from 'fs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, val, i, arr) => {
    if (val.startsWith('--')) acc.push([val.slice(2), arr[i + 1]])
    return acc
  }, []),
)

const inPath = args.in
const outPath = args.out
const startRank = parseInt(args['start-rank'] || '101', 10)
const dedupePath = args['dedupe-against']

if (!inPath || !outPath) {
  console.error('Usage: --in <raw.csv> --out <append.csv> [--start-rank N] [--dedupe-against existing.csv]')
  process.exit(1)
}

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
      } else val += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { cur.push(val); val = '' }
      else if (ch === '\n') { cur.push(val); rows.push(cur); cur = []; val = '' }
      else if (ch === '\r') {}
      else val += ch
    }
  }
  if (val !== '' || cur.length > 0) { cur.push(val); rows.push(cur) }
  return rows
}

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('·') || s.includes('★') || s.includes('—')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

const CHAINS = [
  'one hour', 'horizon services', 'roto-rooter', 'mr. rooter', 'mister rooter',
  'aire serv', 'service experts', 'goettl', 'george brazil', 'parker & sons',
  'parker and sons', 'larson', 'morris-jenkins', 'home depot', 'lowes', "lowe's",
  'sears', 'angi', 'thumbtack', 'home advisor', 'homeadvisor',
]
const isChain = (t) => CHAINS.some((c) => (t || '').toLowerCase().includes(c))

// Dedupe set (by google_place_id)
const dedupePlaceIds = new Set()
if (dedupePath && fs.existsSync(dedupePath)) {
  const dr = parseCSV(fs.readFileSync(dedupePath, 'utf8'))
  const dHeader = dr[0]
  const pidIdx = dHeader.indexOf('google_place_id')
  if (pidIdx >= 0) {
    for (const r of dr.slice(1)) {
      if (r[pidIdx]) dedupePlaceIds.add(r[pidIdx])
    }
    console.log(`Dedupe: loaded ${dedupePlaceIds.size} place IDs from ${dedupePath}`)
  }
}

const raw = parseCSV(fs.readFileSync(inPath, 'utf8'))
const header = raw[0]
const idx = Object.fromEntries(header.map((h, i) => [h, i]))
const rows = raw.slice(1).filter((r) => r.length === header.length)

console.log(`Loaded ${rows.length} raw rows from ${inPath}`)

// Filter
const stats = { closed: 0, no_phone: 0, chain: 0, too_many_reviews: 0, low_rating: 0, too_few_reviews: 0, duplicate: 0 }
const filtered = []
for (const r of rows) {
  const title = r[idx.title]
  const phone = r[idx.phone] || r[idx.phoneUnformatted]
  const rating = parseFloat(r[idx.totalScore]) || 0
  const reviews = parseInt(r[idx.reviewsCount], 10) || 0
  const permClosed = r[idx.permanentlyClosed] === 'true'
  const tempClosed = r[idx.temporarilyClosed] === 'true'
  const placeId = r[idx.placeId]

  if (permClosed || tempClosed) { stats.closed++; continue }
  if (!phone) { stats.no_phone++; continue }
  if (isChain(title)) { stats.chain++; continue }
  if (reviews > 500) { stats.too_many_reviews++; continue }
  if (rating < 4.0) { stats.low_rating++; continue }
  if (reviews < 10) { stats.too_few_reviews++; continue }
  if (dedupePlaceIds.has(placeId)) { stats.duplicate++; continue }

  filtered.push(r)
}

// Sort by opportunity (reviews desc as primary, then rating desc)
filtered.sort((a, b) => {
  const ra = parseInt(a[idx.reviewsCount], 10) || 0
  const rb = parseInt(b[idx.reviewsCount], 10) || 0
  if (rb !== ra) return rb - ra
  const ga = parseFloat(a[idx.totalScore]) || 0
  const gb = parseFloat(b[idx.totalScore]) || 0
  return gb - ga
})

console.log('\nFilter breakdown:')
for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`)
console.log(`  → ${filtered.length} survivors\n`)

// Helpers for output field generation
const BASIC_SITE_PATTERNS = [/wordpress\.com/i, /wix\.com/i, /weebly\.com/i, /godaddysites\.com/i, /squarespace\.com/i]
function siteCategory(url) {
  if (!url) return 'no website'
  if (BASIC_SITE_PATTERNS.some((re) => re.test(url))) return 'basic site'
  return 'has site'
}

function sizeDescriptor(reviews) {
  if (reviews >= 200) return 'established'
  if (reviews >= 50) return 'mid-size'
  return 'small'
}

function tierFor(reviews) {
  if (reviews >= 200) return 'A'
  if (reviews >= 50) return 'B'
  return 'C'
}

function planFor(reviews) {
  if (reviews >= 200) return 'Pro $497'
  if (reviews >= 50) return 'Growth $297'
  return 'Starter $147'
}

function formatPhone(phone, unformatted) {
  const digits = (unformatted || phone || '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return phone || ''
}

function whyTheyNeed(siteCat, reviews) {
  if (siteCat === 'no website') {
    return `No website = 100% of leads come through the phone — every missed call is a lost job. ${reviews} reviews of consistent work = real call volume.`
  }
  if (siteCat === 'basic site') {
    return `Basic website with no booking system — customers still calling for everything. ${reviews} reviews of consistent work = real call volume.`
  }
  return `Strong online presence but no AI receptionist — when techs are on jobs, calls still ring out to voicemail. ${reviews} reviews of consistent work = real call volume.`
}

function pitchHook(name, reviews, rating, city, siteCat) {
  const gapClause = siteCat === 'no website'
    ? `, and looks like you don't even have a website yet, so every job comes through that phone`
    : siteCat === 'basic site'
    ? `, and your site looks like it doesn't have an online booking flow yet`
    : ''
  return `Hey — saw ${name} on Google with ${reviews} reviews at ${rating} stars in ${city}, looks like solid local rep${gapClause}. Calling because most shops your size lose 2-3 jobs a week to missed calls when techs are out — got 90 seconds for one question?`
}

// Output rows (no header — appends to existing sheet)
const outLines = []
filtered.forEach((r, i) => {
  const rank = startRank + i
  const reviews = parseInt(r[idx.reviewsCount], 10) || 0
  const rating = parseFloat(r[idx.totalScore]) || 0
  const businessName = r[idx.title]
  const city = r[idx.city] || ''
  const state = r[idx.state] || ''
  const website = r[idx.website] || ''
  const phone = formatPhone(r[idx.phone], r[idx.phoneUnformatted])
  const address = r[idx.address] || ''
  const placeId = r[idx.placeId] || ''
  const categories = r[idx.categoryName] || ''

  const siteCat = siteCategory(website)
  const tier = tierFor(reviews)
  const plan = planFor(reviews)
  const sizeWord = sizeDescriptor(reviews)
  const ratingStr = rating % 1 === 0 ? String(parseInt(rating, 10)) : String(rating)

  const summary = `${sizeWord} in ${city}, ${reviews} reviews · ${ratingStr}★, ${siteCat}`
  const why = whyTheyNeed(siteCat, reviews)
  const hook = pitchHook(businessName, reviews, ratingStr, city, siteCat)

  const cols = [
    rank,
    tier,
    'FALSE',
    'FALSE',
    businessName,
    phone,
    website || '(none)',
    city,
    state,
    ratingStr,
    reviews,
    categories,
    plan,
    summary,
    why,
    hook,
    placeId,
    address,
  ].map(csvEscape).join(',')

  outLines.push(cols)
})

fs.writeFileSync(outPath, outLines.join('\n') + '\n', 'utf8')

const tierCounts = { A: 0, B: 0, C: 0 }
filtered.forEach((r) => { tierCounts[tierFor(parseInt(r[idx.reviewsCount], 10) || 0)]++ })

console.log(`✓ Wrote ${outLines.length} rows to ${outPath}`)
console.log(`  Tier breakdown: A=${tierCounts.A} (Pro $497) · B=${tierCounts.B} (Growth $297) · C=${tierCounts.C} (Starter $147)`)
console.log(`  Ranks: ${startRank}..${startRank + outLines.length - 1}`)
console.log(`\nReady to append: paste the contents of ${outPath} after the last row of your existing sheet.`)
