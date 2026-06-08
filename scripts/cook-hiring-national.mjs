#!/usr/bin/env node
/**
 * cook-hiring-national.mjs
 *
 * National hiring-intent scraper. Pulls receptionist / dispatcher / CSR
 * job postings from Indeed via Apify across ~50 US metros × 6 trade
 * queries, dedups, then enriches every unique company name with Google
 * Maps Places to get the verified business phone + review count + rating.
 *
 * Output: leads/hiring-intent-<date>.{json,xlsx}
 *   xlsx = Tommy-compatible: Business | Phone | City | Trade | Tier |
 *          Posted | Reviews | Rating | Report URL | Called? | Outcome |
 *          Notes
 *
 * Tiers:
 *   🔥 HOT   = ≤30 reviews + posted ≤7 days ago (recent + small-dog)
 *   ⚡ WARM  = ≤100 reviews + posted ≤14 days
 *   🕓 COOL  = ≤150 reviews OR older posts
 *   (Skip if >150 reviews — corporate, not ICP)
 *
 * USAGE
 *   node scripts/cook-hiring-national.mjs
 *   node scripts/cook-hiring-national.mjs --top20    (top 20 metros only)
 *   node scripts/cook-hiring-national.mjs --queries 3 (limit queries)
 */

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import ExcelJS from 'exceljs'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const APIFY_TOKEN = process.env.APIFY_TOKEN
if (!APIFY_TOKEN) {
  console.error('FATAL: APIFY_TOKEN env var missing — add to .env.local')
  process.exit(1)
}

const args = process.argv.slice(2)
const ONLY_TOP_20 = args.includes('--top20')
const QUERY_LIMIT = Number(
  (args.find((a) => a.startsWith('--queries')) || '').split(/[ =]/)[1] ?? 0,
)

// ── METROS ──────────────────────────────────────────────────────
// Top 50 home-service density. Sun Belt heavy because HVAC demand
// + small-dog density skews south. Format: "City, ST" — Indeed accepts.
const METROS_ALL = [
  // Sun Belt
  'Phoenix, AZ', 'Tucson, AZ', 'Las Vegas, NV', 'Henderson, NV',
  'Houston, TX', 'Dallas, TX', 'Fort Worth, TX', 'San Antonio, TX', 'Austin, TX',
  'Tampa, FL', 'Orlando, FL', 'Miami, FL', 'Jacksonville, FL',
  'Atlanta, GA', 'Charlotte, NC', 'Raleigh, NC', 'Nashville, TN',
  // Rust Belt / Midwest
  'Chicago, IL', 'Naperville, IL', 'Detroit, MI', 'Grand Rapids, MI',
  'Cleveland, OH', 'Columbus, OH', 'Cincinnati, OH',
  'Indianapolis, IN', 'Kansas City, MO', 'St. Louis, MO', 'Minneapolis, MN',
  'Milwaukee, WI',
  // California
  'Los Angeles, CA', 'San Diego, CA', 'Sacramento, CA', 'Riverside, CA',
  'Bakersfield, CA', 'Fresno, CA',
  // Northeast suburbs (where HVAC fleets are oldest)
  'Philadelphia, PA', 'Pittsburgh, PA', 'Newark, NJ', 'Cherry Hill, NJ',
  'Long Island, NY', 'Westchester, NY', 'Boston, MA', 'Worcester, MA',
  // Pacific NW + Mountain
  'Seattle, WA', 'Spokane, WA', 'Portland, OR', 'Salt Lake City, UT',
  'Denver, CO', 'Colorado Springs, CO',
  // South Atlantic
  'Richmond, VA', 'Virginia Beach, VA',
]
const TOP_20 = [
  'Phoenix, AZ', 'Las Vegas, NV', 'Houston, TX', 'Dallas, TX', 'San Antonio, TX',
  'Austin, TX', 'Tampa, FL', 'Orlando, FL', 'Jacksonville, FL', 'Atlanta, GA',
  'Charlotte, NC', 'Nashville, TN', 'Chicago, IL', 'Indianapolis, IN',
  'Kansas City, MO', 'Los Angeles, CA', 'San Diego, CA', 'Denver, CO',
  'Philadelphia, PA', 'Boston, MA',
]
const METROS = ONLY_TOP_20 ? TOP_20 : METROS_ALL

// ── QUERIES ─────────────────────────────────────────────────────
// Ordered by signal strength. Top 3 cover ~80% of hits. The trailing
// generics ("appointment setter") catch shops that use weird titles.
const QUERIES = [
  'receptionist HVAC',
  'dispatcher HVAC',
  'office manager plumbing',
  'CSR heating and cooling',
  'customer service air conditioning',
  'front desk electrician',
  'appointment setter home services',
]
const ACTIVE_QUERIES = QUERY_LIMIT > 0 ? QUERIES.slice(0, QUERY_LIMIT) : QUERIES

// ── ACTORS ──────────────────────────────────────────────────────
const INDEED_ACTOR = 'misceres/indeed-scraper'
const PLACES_ACTOR = 'compass/crawler-google-places'

const CONCURRENCY = 4        // parallel Apify Indeed actor runs (lower
                             // so we don't trip the Apify gateway burst limit)
const PLACES_CONCURRENCY = 5 // parallel Google Maps lookups

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  HIRING-INTENT NATIONAL · ${METROS.length} metros × ${ACTIVE_QUERIES.length} queries`)
console.log(`  Combos to run: ${METROS.length * ACTIVE_QUERIES.length}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

const DATE = new Date().toISOString().slice(0, 10)
const OUT_DIR = 'C:\\Users\\peter\\ringoco\\leads'
const OUT_JSON = path.join(OUT_DIR, `hiring-intent-${DATE}.json`)
const OUT_XLSX = path.join(OUT_DIR, `hiring-intent-${DATE}.xlsx`)

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

// ── STEP 1 — Indeed scrape every (metro × query) ────────────────
async function scrapeIndeed(metro, query) {
  const input = {
    position: query,
    location: metro,
    country: 'US',
    maxItems: 60,
    parseCompanyDetails: false,
    saveOnlyUniqueItems: true,
  }
  const url = `https://api.apify.com/v2/acts/${INDEED_ACTOR.replace('/', '~')}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&clean=true`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      console.warn(`  ⚠ ${metro} / "${query}" → HTTP ${res.status}`)
      return []
    }
    const items = await res.json()
    return Array.isArray(items) ? items : []
  } catch (e) {
    console.warn(`  ⚠ ${metro} / "${query}" → ${e.message}`)
    return []
  }
}

const combos = []
for (const metro of METROS) for (const q of ACTIVE_QUERIES) combos.push({ metro, q })

console.log(`\n▶ STEP 1 — Indeed scrape (concurrency ${CONCURRENCY})`)
const indeedStart = Date.now()
const indeedResults = []
let combosDone = 0
async function indeedWorker(slice) {
  for (const { metro, q } of slice) {
    const items = await scrapeIndeed(metro, q)
    indeedResults.push(...items.map((it) => ({ ...it, _source_metro: metro, _source_query: q })))
    combosDone++
    if (combosDone % 25 === 0) {
      const sec = Math.round((Date.now() - indeedStart) / 1000)
      console.log(`  [${combosDone}/${combos.length}] ${indeedResults.length} listings · ${sec}s`)
    }
  }
}
const slices = Array.from({ length: CONCURRENCY }, (_, i) =>
  combos.filter((_, idx) => idx % CONCURRENCY === i),
)
await Promise.all(slices.map(indeedWorker))
console.log(`  ✓ Indeed scrape done · ${indeedResults.length} raw listings · ${Math.round((Date.now() - indeedStart) / 1000)}s`)

// Persist raw immediately as a safety checkpoint.
fs.writeFileSync(
  path.join(OUT_DIR, `hiring-intent-${DATE}-raw.json`),
  JSON.stringify(indeedResults, null, 2),
)

// ── STEP 2 — Dedup by (company_name + city) ─────────────────────
console.log(`\n▶ STEP 2 — Dedup + initial filter`)
const seen = new Map()
for (const r of indeedResults) {
  const name = (r.companyName || r.company || '').trim()
  const loc = (r.location || r._source_metro || '').trim()
  if (!name) continue
  // Skip noise companies that pollute receptionist searches
  const lc = name.toLowerCase()
  const noisyNames = [
    'staffing', 'temp ', 'temporary', 'agency', 'recruit', 'talent',
    'health', 'medical', 'dental', 'clinic', 'hospital', 'spa',
    'law', 'attorney', 'realty', 'real estate', 'salon',
    'university', 'school', 'church', 'casino',
    'amazon', 'walmart', 'target', 'fedex', 'ups',
  ]
  if (noisyNames.some((nz) => lc.includes(nz))) continue

  // STRONG trade match — must be in BOTH the description AND the
  // position title looking like a real home-service biz role.
  const descr = ((r.description || '') + ' ' + (r.positionName || r.title || '')).toLowerCase()
  const tradeKeywords = ['hvac', 'plumb', 'electric', 'heat', 'air condition', 'cool', 'mechanical', 'contractor', 'install', 'repair', 'home service', 'roof']
  const tradeHit = tradeKeywords.some((kw) => descr.includes(kw))
  if (!tradeHit) continue

  // Position title must be a phone-answering role (not a tech/installer
  // who happened to land on the receptionist query)
  const title = (r.positionName || r.title || '').toLowerCase()
  const roleKeywords = ['receptionist', 'dispatch', 'csr', 'customer service', 'office', 'front desk', 'admin', 'appointment', 'scheduler', 'call', 'phone']
  const roleHit = roleKeywords.some((kw) => title.includes(kw))
  if (!roleHit) continue

  // Post age must be ≤30 days — older posts likely filled or stale
  const postedAt = r.postingDateParsed || r.postingDate || r.datePosted || ''
  if (postedAt) {
    const ageDays = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000)
    if (ageDays > 30) continue
  }

  const key = `${name.toLowerCase()}__${loc.toLowerCase()}`
  const prior = seen.get(key)
  // Keep the most-recent post if dup
  if (!prior || (postedAt && (!prior._postedAt || postedAt > prior._postedAt))) {
    seen.set(key, { ...r, _postedAt: postedAt })
  }
}
const dedupped = [...seen.values()]
console.log(`  ✓ ${dedupped.length} unique companies after dedup + trade filter`)

// ── STEP 3 — Google Maps enrich (phone + reviews + rating) ──────
console.log(`\n▶ STEP 3 — Google Maps enrich (concurrency ${PLACES_CONCURRENCY})`)
async function enrichOne(item) {
  const name = item.companyName || item.company || ''
  const loc = item.location || item._source_metro || ''
  if (!name) return null
  const input = {
    searchStringsArray: [`${name} ${loc}`],
    maxCrawledPlacesPerSearch: 1,
    language: 'en',
    onlyDataFromSearchPage: true,
    skipClosedPlaces: true,
  }
  const url = `https://api.apify.com/v2/acts/${PLACES_ACTOR.replace('/', '~')}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&clean=true&fields=title,address,city,state,phoneUnformatted,phone,website,totalScore,reviewsCount,permanentlyClosed,placeId,url`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) return null
    const arr = await res.json()
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null
  } catch {
    return null
  }
}

const enrichStart = Date.now()
let enrichDone = 0
const enriched = []
async function placesWorker(slice) {
  for (const item of slice) {
    const place = await enrichOne(item)
    enriched.push({ raw: item, place })
    enrichDone++
    if (enrichDone % 50 === 0) {
      const sec = Math.round((Date.now() - enrichStart) / 1000)
      console.log(`  [${enrichDone}/${dedupped.length}] ${sec}s`)
    }
  }
}
const placesSlices = Array.from({ length: PLACES_CONCURRENCY }, (_, i) =>
  dedupped.filter((_, idx) => idx % PLACES_CONCURRENCY === i),
)
await Promise.all(placesSlices.map(placesWorker))
console.log(`  ✓ Enrichment done · ${Math.round((Date.now() - enrichStart) / 1000)}s`)

// ── STEP 4 — ICP filter + tier ──────────────────────────────────
console.log(`\n▶ STEP 4 — ICP filter + tier`)
const today = Date.now()
function daysAgo(iso) {
  if (!iso) return 999
  try {
    return Math.floor((today - new Date(iso).getTime()) / 86_400_000)
  } catch {
    return 999
  }
}
function detectTrade(text) {
  const t = (text || '').toLowerCase()
  if (t.includes('hvac') || t.includes('heating') || t.includes('air condition')) return 'HVAC'
  if (t.includes('plumb')) return 'Plumbing'
  if (t.includes('electric')) return 'Electrical'
  if (t.includes('roof')) return 'Roofing'
  return 'Home services'
}

const final = []
for (const e of enriched) {
  if (!e.place) continue
  const p = e.place
  if (p.permanentlyClosed) continue
  const reviews = p.reviewsCount ?? 0
  const rating = p.totalScore ?? 0
  const phone = (p.phoneUnformatted || p.phone || '').trim()
  if (!phone) continue
  if (reviews > 150) continue          // not ICP — corporate
  if (rating > 0 && rating < 3.5) continue // too low quality

  const posted = e.raw._postedAt || e.raw.postingDateParsed || e.raw.postingDate || ''
  const postAge = daysAgo(posted)
  const trade = detectTrade(
    (p.title || '') + ' ' + (e.raw.positionName || e.raw.title || '') + ' ' + (e.raw.description || ''),
  )

  let tier = 'COOL'
  if (reviews <= 30 && postAge <= 7) tier = 'HOT'
  else if (reviews <= 100 && postAge <= 14) tier = 'WARM'

  const city = p.city || (p.address || '').split(',').slice(-3, -2)[0]?.trim() || e.raw._source_metro

  final.push({
    business_name: p.title || e.raw.companyName,
    phone,
    city: city || '',
    state: p.state || '',
    address: p.address || '',
    website: p.website || '',
    trade,
    reviews,
    rating,
    placeId: p.placeId || '',
    google_url: p.url || '',
    posted_at: posted,
    post_age_days: postAge,
    tier,
    indeed_url: e.raw.url || e.raw.externalApplyLink || '',
    position_title: e.raw.positionName || e.raw.title || '',
    salary: e.raw.salary || '',
    source_query: e.raw._source_query,
    source_metro: e.raw._source_metro,
  })
}

final.sort((a, b) => {
  const order = { HOT: 0, WARM: 1, COOL: 2 }
  if (order[a.tier] !== order[b.tier]) return order[a.tier] - order[b.tier]
  return (a.post_age_days ?? 999) - (b.post_age_days ?? 999)
})

const hot = final.filter((f) => f.tier === 'HOT')
const warm = final.filter((f) => f.tier === 'WARM')
const cool = final.filter((f) => f.tier === 'COOL')
console.log(`  ✓ Final ICP qualified: ${final.length}`)
console.log(`    🔥 HOT  : ${hot.length}`)
console.log(`    ⚡ WARM : ${warm.length}`)
console.log(`    🕓 COOL : ${cool.length}`)

fs.writeFileSync(OUT_JSON, JSON.stringify({ generated_at: new Date().toISOString(), counts: { hot: hot.length, warm: warm.length, cool: cool.length, total: final.length }, leads: final }, null, 2))

// ── STEP 5 — Excel output (Tommy-compatible) ────────────────────
console.log(`\n▶ STEP 5 — Excel`)

function reportUrl(l) {
  const p = new URLSearchParams({
    for: l.business_name,
    city: l.city,
    type: l.trade === 'Electrical' ? 'Electrical' : l.trade === 'Plumbing' ? 'Plumbing' : 'HVAC',
  })
  if (l.state) p.set('state', l.state)
  return `https://www.bellavego.com/sample-report?${p.toString()}`
}

const wb = new ExcelJS.Workbook()
wb.creator = 'BellAveGo · Jarvis'
wb.created = new Date()

const COLUMNS = [
  { header: 'Tier',        key: 'tier',          width: 8 },
  { header: 'Business',    key: 'business_name', width: 36 },
  { header: 'Phone',       key: 'phone',         width: 18 },
  { header: 'City',        key: 'city',          width: 14 },
  { header: 'Trade',       key: 'trade',         width: 12 },
  { header: 'Posted',      key: 'posted',        width: 12 },
  { header: 'Job Title',   key: 'position_title',width: 26 },
  { header: 'Salary',      key: 'salary',        width: 16 },
  { header: 'Reviews',     key: 'reviews',       width: 8 },
  { header: 'Rating',      key: 'rating',        width: 8 },
  { header: 'Report URL',  key: 'report_url',    width: 56 },
  { header: 'Called?',     key: 'called',        width: 14 },
  { header: 'Outcome',     key: 'outcome',       width: 22 },
  { header: 'Notes',       key: 'notes',         width: 36 },
]

function buildSheet(name, leads) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
  ws.columns = COLUMNS.map((c) => ({ ...c }))
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } }
    c.alignment = { vertical: 'middle', horizontal: 'left' }
    c.border = { bottom: { style: 'medium', color: { argb: 'FF334155' } } }
  })
  ws.getRow(1).height = 30

  for (const l of leads) {
    const row = ws.addRow({
      tier: l.tier === 'HOT' ? '🔥 HOT' : l.tier === 'WARM' ? '⚡ WARM' : '🕓 COOL',
      business_name: l.business_name,
      phone: l.phone,
      city: l.city,
      trade: l.trade,
      posted: l.posted_at ? l.posted_at.slice(0, 10) : '',
      position_title: l.position_title,
      salary: l.salary,
      reviews: l.reviews,
      rating: l.rating,
      report_url: reportUrl(l),
      called: 'Not Yet',
      outcome: '',
      notes: '',
    })
    row.eachCell({ includeEmpty: true }, (c) => {
      c.font = { size: 11 }
      c.alignment = { vertical: 'top', wrapText: true }
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
    })

    // Tier coloring
    const tierCell = row.getCell(1)
    if (l.tier === 'HOT') tierCell.font = { size: 11, color: { argb: 'FFDC2626' }, bold: true }
    else if (l.tier === 'WARM') tierCell.font = { size: 11, color: { argb: 'FFD97706' }, bold: true }

    // Clickable phone
    const phoneCell = row.getCell(3)
    phoneCell.value = { text: l.phone, hyperlink: `tel:${String(l.phone).replace(/[^\d+]/g, '')}` }
    phoneCell.font = { size: 11, color: { argb: 'FF2563EB' }, underline: true, bold: true }

    // Clickable report URL
    const urlCell = row.getCell(11)
    const u = reportUrl(l)
    urlCell.value = { text: u, hyperlink: u }
    urlCell.font = { size: 10, color: { argb: 'FF0AA89F' }, underline: true }
  }

  if (leads.length > 0) {
    for (let i = 2; i <= leads.length + 1; i++) {
      ws.getCell(`L${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Not Yet,Called,Voicemail,No Answer,Interested,Trial Started,PAID,Not Interested,Wrong Number,Hostile,DNC"'],
      }
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: leads.length + 1, column: COLUMNS.length } }
}

buildSheet('🔥 HOT', hot)
buildSheet('⚡ WARM', warm)
buildSheet('🕓 COOL', cool)
buildSheet(`All ${final.length}`, final)

await wb.xlsx.writeFile(OUT_XLSX)
console.log(`  ✓ ${OUT_XLSX}`)

// Mirror to OneDrive clone so Peter sees it where he works.
const ONEDRIVE_OUT = 'C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads'
try {
  if (!fs.existsSync(ONEDRIVE_OUT)) fs.mkdirSync(ONEDRIVE_OUT, { recursive: true })
  fs.copyFileSync(OUT_XLSX, path.join(ONEDRIVE_OUT, path.basename(OUT_XLSX)))
  fs.copyFileSync(OUT_JSON, path.join(ONEDRIVE_OUT, path.basename(OUT_JSON)))
  console.log(`  ✓ Mirrored to ${ONEDRIVE_OUT}`)
} catch (e) {
  console.warn(`  ⚠ OneDrive mirror failed: ${e.message}`)
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  DONE · ${final.length} leads · 🔥${hot.length} ⚡${warm.length} 🕓${cool.length}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
