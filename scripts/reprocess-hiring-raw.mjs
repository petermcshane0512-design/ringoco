#!/usr/bin/env node
/**
 * reprocess-hiring-raw.mjs — re-run the dedup, enrich, and filter
 * pipeline against the already-scraped hiring-intent-*-raw.json so we
 * don't burn Indeed Apify credits again. Fixes:
 *   1. Looser filter (role-title check too narrow, dropping legit CSRs)
 *   2. Google Maps actor URL had `fields=` parameter that returned empty
 */
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import ExcelJS from 'exceljs'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })
const APIFY_TOKEN = process.env.APIFY_TOKEN
if (!APIFY_TOKEN) { console.error('APIFY_TOKEN missing'); process.exit(1) }

const PLACES_ACTOR = 'compass/crawler-google-places'
const PLACES_CONCURRENCY = 4
const DATE = new Date().toISOString().slice(0, 10)
const OUT_DIR = 'C:\\Users\\peter\\ringoco\\leads'
const RAW = path.join(OUT_DIR, `hiring-intent-${DATE}-raw.json`)
const OUT_JSON = path.join(OUT_DIR, `hiring-intent-${DATE}.json`)
const OUT_XLSX = path.join(OUT_DIR, `hiring-intent-${DATE}.xlsx`)

const rawListings = JSON.parse(fs.readFileSync(RAW, 'utf8'))
console.log(`▶ ${rawListings.length} raw Indeed listings loaded`)

// ── DEDUP + LOOSE FILTER ────────────────────────────────────────
const seen = new Map()
const stats = { name: 0, name_noise: 0, no_trade: 0, no_role: 0, too_old: 0, kept: 0 }
for (const r of rawListings) {
  const name = (r.companyName || r.company || '').trim()
  if (!name) { stats.name++; continue }
  const lc = name.toLowerCase()
  const noisyNames = [
    'staffing', 'temp ', 'temporary', 'agency', 'recruit', 'talent',
    'health', 'medical', 'dental', 'clinic', 'hospital', 'spa',
    'law', 'attorney', 'realty', 'real estate', 'salon',
    'university', 'school', 'church', 'casino',
    'amazon', 'walmart', 'target', 'fedex', 'ups',
  ]
  if (noisyNames.some((nz) => lc.includes(nz))) { stats.name_noise++; continue }

  // LOOSER trade check — match on company name OR description OR title.
  // Original requiring trade word in description killed too many legit
  // shops whose Indeed posting description was generic boilerplate.
  const allText = (
    (r.description || '') + ' ' + (r.positionName || r.title || '') + ' ' + name
  ).toLowerCase()
  const tradeKeywords = ['hvac', 'plumb', 'electric', 'heat', 'air condition', 'cool', 'mechanical', 'contractor', 'install', 'repair', 'home service', 'roof', 'furnace', 'cooling', 'a/c ', ' ac ']
  if (!tradeKeywords.some((kw) => allText.includes(kw))) { stats.no_trade++; continue }

  // LOOSER role check — match keywords across title OR description so
  // a shop calling the role "Service Coordinator" with phone duties in
  // the description still passes.
  const titleAndDesc = ((r.positionName || r.title || '') + ' ' + (r.description || '')).toLowerCase()
  const roleKeywords = [
    'receptionist', 'dispatch', 'csr', 'customer service', 'front desk',
    'admin', 'appointment', 'scheduler', 'call', 'phone', 'office',
    'service coordinator', 'service writer', 'sales', 'inbound',
  ]
  if (!roleKeywords.some((kw) => titleAndDesc.includes(kw))) { stats.no_role++; continue }

  const postedAt = r.postingDateParsed || r.postingDate || r.datePosted || ''
  if (postedAt) {
    const ageDays = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000)
    if (ageDays > 45) { stats.too_old++; continue }
  }

  const locKey = (r.location || r._source_metro || '').toLowerCase().split(',')[0].trim()
  const key = `${lc}__${locKey}`
  const prior = seen.get(key)
  if (!prior || (postedAt && (!prior._postedAt || postedAt > prior._postedAt))) {
    seen.set(key, { ...r, _postedAt: postedAt })
  }
  stats.kept++
}
const dedupped = [...seen.values()]
console.log(`\n  Filter stats:`)
for (const [k, v] of Object.entries(stats)) console.log(`    ${k}: ${v}`)
console.log(`  ✓ ${dedupped.length} unique companies after dedup`)

// ── GOOGLE MAPS ENRICH (no `fields=` param this time) ───────────
async function enrichOne(item) {
  const name = item.companyName || item.company || ''
  const loc = item.location || item._source_metro || ''
  if (!name) return null
  const url = `https://api.apify.com/v2/acts/${PLACES_ACTOR.replace('/', '~')}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&clean=true`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchStringsArray: [`${name} ${loc}`],
        maxCrawledPlacesPerSearch: 1,
        language: 'en',
        skipClosedPlaces: true,
      }),
    })
    if (!res.ok) return null
    const arr = await res.json()
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null
  } catch {
    return null
  }
}

console.log(`\n▶ Enrich ${dedupped.length} with Google Maps (concurrency ${PLACES_CONCURRENCY})`)
const enrichStart = Date.now()
let done = 0
const enriched = []
async function worker(slice) {
  for (const item of slice) {
    const place = await enrichOne(item)
    enriched.push({ raw: item, place })
    done++
    if (done % 25 === 0) {
      const sec = Math.round((Date.now() - enrichStart) / 1000)
      console.log(`  [${done}/${dedupped.length}] ${sec}s`)
    }
  }
}
const slices = Array.from({ length: PLACES_CONCURRENCY }, (_, i) =>
  dedupped.filter((_, idx) => idx % PLACES_CONCURRENCY === i),
)
await Promise.all(slices.map(worker))
console.log(`  ✓ Enrichment done · ${Math.round((Date.now() - enrichStart) / 1000)}s`)

// ── FINAL ICP FILTER + TIER ─────────────────────────────────────
const today = Date.now()
function daysAgo(iso) {
  if (!iso) return 999
  try { return Math.floor((today - new Date(iso).getTime()) / 86_400_000) } catch { return 999 }
}
function detectTrade(text) {
  const t = (text || '').toLowerCase()
  if (t.includes('hvac') || t.includes('heating') || t.includes('air condition') || t.includes('cooling')) return 'HVAC'
  if (t.includes('plumb')) return 'Plumbing'
  if (t.includes('electric')) return 'Electrical'
  if (t.includes('roof')) return 'Roofing'
  return 'Home services'
}

const finalLeads = []
const rejected = { no_place: 0, closed: 0, no_phone: 0, too_many_reviews: 0, low_rating: 0 }
for (const e of enriched) {
  if (!e.place) { rejected.no_place++; continue }
  const p = e.place
  if (p.permanentlyClosed) { rejected.closed++; continue }
  const phone = (p.phoneUnformatted || p.phone || '').trim()
  if (!phone) { rejected.no_phone++; continue }
  const reviews = p.reviewsCount ?? 0
  const rating = p.totalScore ?? p.rating ?? 0
  if (reviews > 150) { rejected.too_many_reviews++; continue }
  if (rating > 0 && rating < 3.5) { rejected.low_rating++; continue }

  const posted = e.raw._postedAt || e.raw.postingDateParsed || ''
  const postAge = daysAgo(posted)
  const trade = detectTrade(
    (p.title || '') + ' ' + (p.categoryName || '') + ' ' + (e.raw.positionName || e.raw.title || '') + ' ' + (e.raw.description || ''),
  )

  let tier = 'COOL'
  if (reviews <= 30 && postAge <= 7) tier = 'HOT'
  else if (reviews <= 100 && postAge <= 14) tier = 'WARM'

  finalLeads.push({
    business_name: p.title || e.raw.company,
    phone,
    city: p.city || (p.address || '').split(',').slice(-3, -2)[0]?.trim() || e.raw._source_metro,
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
    indeed_url: e.raw.url || '',
    position_title: e.raw.positionName || e.raw.title || '',
    salary: e.raw.salary || '',
    source_metro: e.raw._source_metro,
  })
}

finalLeads.sort((a, b) => {
  const order = { HOT: 0, WARM: 1, COOL: 2 }
  if (order[a.tier] !== order[b.tier]) return order[a.tier] - order[b.tier]
  return (a.post_age_days ?? 999) - (b.post_age_days ?? 999)
})

const hot = finalLeads.filter((f) => f.tier === 'HOT')
const warm = finalLeads.filter((f) => f.tier === 'WARM')
const cool = finalLeads.filter((f) => f.tier === 'COOL')
console.log(`\n  Reject reasons:`)
for (const [k, v] of Object.entries(rejected)) console.log(`    ${k}: ${v}`)
console.log(`\n  ✓ Final: ${finalLeads.length}  ·  🔥${hot.length} ⚡${warm.length} 🕓${cool.length}`)

fs.writeFileSync(OUT_JSON, JSON.stringify({
  generated_at: new Date().toISOString(),
  counts: { hot: hot.length, warm: warm.length, cool: cool.length, total: finalLeads.length },
  leads: finalLeads,
}, null, 2))

// ── EXCEL OUTPUT ────────────────────────────────────────────────
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
  { header: 'Tier',         key: 'tier',          width: 8 },
  { header: 'Business',     key: 'business_name', width: 36 },
  { header: 'Phone',        key: 'phone',         width: 18 },
  { header: 'City',         key: 'city',          width: 14 },
  { header: 'Trade',        key: 'trade',         width: 12 },
  { header: 'Posted',       key: 'posted',        width: 12 },
  { header: 'Job Title',    key: 'position_title',width: 26 },
  { header: 'Salary',       key: 'salary',        width: 16 },
  { header: 'Reviews',      key: 'reviews',       width: 8 },
  { header: 'Rating',       key: 'rating',        width: 8 },
  { header: 'Report URL',   key: 'report_url',    width: 56 },
  { header: 'Called?',      key: 'called',        width: 14 },
  { header: 'Outcome',      key: 'outcome',       width: 22 },
  { header: 'Notes',        key: 'notes',         width: 36 },
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
    const tierCell = row.getCell(1)
    if (l.tier === 'HOT') tierCell.font = { size: 11, color: { argb: 'FFDC2626' }, bold: true }
    else if (l.tier === 'WARM') tierCell.font = { size: 11, color: { argb: 'FFD97706' }, bold: true }
    const phoneCell = row.getCell(3)
    phoneCell.value = { text: l.phone, hyperlink: `tel:${String(l.phone).replace(/[^\d+]/g, '')}` }
    phoneCell.font = { size: 11, color: { argb: 'FF2563EB' }, underline: true, bold: true }
    const urlCell = row.getCell(11)
    const u = reportUrl(l)
    urlCell.value = { text: u, hyperlink: u }
    urlCell.font = { size: 10, color: { argb: 'FF0AA89F' }, underline: true }
  }
  if (leads.length > 0) {
    for (let i = 2; i <= leads.length + 1; i++) {
      ws.getCell(`L${i}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: ['"Not Yet,Called,Voicemail,No Answer,Interested,Trial Started,PAID,Not Interested,Wrong Number,Hostile,DNC"'],
      }
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: leads.length + 1, column: COLUMNS.length } }
}

buildSheet('🔥 HOT', hot)
buildSheet('⚡ WARM', warm)
buildSheet('🕓 COOL', cool)
buildSheet(`All ${finalLeads.length}`, finalLeads)
await wb.xlsx.writeFile(OUT_XLSX)

const ONEDRIVE = 'C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads'
try {
  if (!fs.existsSync(ONEDRIVE)) fs.mkdirSync(ONEDRIVE, { recursive: true })
  fs.copyFileSync(OUT_XLSX, path.join(ONEDRIVE, path.basename(OUT_XLSX)))
  fs.copyFileSync(OUT_JSON, path.join(ONEDRIVE, path.basename(OUT_JSON)))
  console.log(`  ✓ Mirrored to ${ONEDRIVE}`)
} catch (e) { console.warn(`  ⚠ ${e.message}`) }

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  DONE · ${finalLeads.length} leads · 🔥${hot.length} ⚡${warm.length} 🕓${cool.length}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
