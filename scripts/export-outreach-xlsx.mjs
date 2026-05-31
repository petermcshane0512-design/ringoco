#!/usr/bin/env node
/**
 * export-outreach-xlsx.mjs — formatted Excel workbook with colors, frozen
 * headers, status-coded rows, and demographic data per ZIP.
 *
 * Output: leads/outreach-master.xlsx
 *
 * Color legend (row fill):
 *   🟢 sent + opened report   → green
 *   🔵 sent + not opened      → blue
 *   🟠 reply received         → orange
 *   🔴 bounced                → red
 *   ⚪ queued / not sent      → light gray
 *
 * Sections (column groups, color-coded headers):
 *   IDENTITY      navy
 *   CONTACT       teal
 *   DEMOGRAPHICS  orange (real Census data per ZIP)
 *   QUALITY       gold
 *   OUTREACH      navy
 *   PERFORMANCE   green
 *   LINKS         gray
 *
 * USAGE
 *   node scripts/export-outreach-xlsx.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

// ── Auto-save guard: if outreach-master.xlsx already exists, pull Peter's
// manual edits BACK into the DB before regenerating. Belt-and-suspenders
// so a forgotten import-edits run never silently wipes call notes. ────────
import { spawnSync } from 'node:child_process'
const XLSX_PATH = 'C:\\Users\\peter\\ringoco\\leads\\outreach-master.xlsx'
if (fs.existsSync(XLSX_PATH)) {
  console.log(`♻️  Existing ${path.basename(XLSX_PATH)} found — importing your edits first...`)
  const r = spawnSync('node', ['scripts/import-outreach-edits.mjs'], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.warn('   ⚠ import-edits exited non-zero. Refusing to overwrite.')
    process.exit(1)
  }
  console.log('   ✅ edits imported to DB — safe to regenerate\n')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const ROOT = 'C:\\Users\\peter\\ringoco\\leads'
const readCSV = (p) => fs.existsSync(p) ? parse(fs.readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true, trim: true }) : []
const norm = (s) => (s || '').toLowerCase().trim()

// Sweep ALL with-emails CSVs in /leads so freshly scraped cities + small-dog
// batches show up in the master sheet without manual wiring. Per Peter 5/28:
// new leads must appear at the top of the file.
const allCsvs = fs.readdirSync(ROOT).filter((f) => f.endsWith('.csv'))
const emailCsvFiles = allCsvs.filter((f) =>
  /with-emails|local-emails|enriched/.test(f) && !/instantly|batch/.test(f),
)
console.log(`📂 Scanning ${emailCsvFiles.length} email-enriched CSVs for rows...`)

let baseRows = readCSV(path.join(ROOT, 'arizona-hvac-top-100.csv'))
let emailRows = []
for (const f of emailCsvFiles) {
  const r = readCSV(path.join(ROOT, f))
  emailRows.push(...r)
  // Some files have richer base data — merge into baseRows for fields like
  // phone/address/reviews/website that aren't in outreach_leads.
  if (!f.includes('arizona-hvac-top-100')) baseRows.push(...r)
}
// Dedup baseRows by business name (keep first match)
const _seenBase = new Set()
baseRows = baseRows.filter((r) => {
  const k = norm(r.business_name || r.title || r.name || r.company_name)
  if (!k || _seenBase.has(k)) return false
  _seenBase.add(k)
  return true
})
const today = readCSV(path.join(ROOT, 'today-send.csv'))
const tonight = readCSV(path.join(ROOT, 'tonight-second-batch.csv'))

const byName = (rows, k) => { const m = new Map(); for (const r of rows) { const key = norm(r[k] || r.business_name || r.title || r.company_name); if (key) m.set(key, r) } return m }
const byEmail = (rows) => { const m = new Map(); for (const r of rows) { const e = norm(r.email); if (e) m.set(e, r) } return m }

const baseByName = byName(baseRows, 'business_name')
const emailByName = byName(emailRows, 'business_name')
const sentB1 = byEmail(today)
const sentB2 = byEmail(tonight)

// outreach_leads snapshot — pulls follow-up tracking columns too so Peter's
// manual edits (call notes, text responses, demo outcomes) flow into the
// Excel on every refresh.
const { data: dbLeads } = await supabase
  .from('outreach_leads')
  .select(`
    email, business_name, owner_first_name, status, campaign_id, pushed_at, updated_at,
    call_attempted_at, call_outcome, call_notes,
    text_opt_in_at, text_sent_at, text_response_at, text_response,
    demo_booked_at, demo_outcome,
    trial_started_at, paid_at, plan_tier_signed, notes
  `)
const dbByEmail = byEmail(dbLeads ?? [])

// sample_reports for clicks + demographics
const { data: reports } = await supabase
  .from('sample_reports')
  .select('business_name, zip, lead_email, open_count, last_opened_at, generated_at, report')
const reportByName = new Map()
const reportByEmail = new Map()
for (const r of reports ?? []) {
  const key = norm(r.business_name)
  if (key && !reportByName.has(key)) reportByName.set(key, r)
  if (r.lead_email) reportByEmail.set(norm(r.lead_email), r)
}

// Union of all businesses
const allBusinesses = new Set([
  ...emailRows.map((r) => norm(r.business_name)),
  ...baseRows.map((r) => norm(r.business_name)),
])

let rows = []
for (const key of allBusinesses) {
  if (!key) continue
  const base = baseByName.get(key)
  const enriched = emailByName.get(key)
  const email = norm(enriched?.email)
  const dbRow = email ? dbByEmail.get(email) : null
  const b1 = email ? sentB1.get(email) : null
  const b2 = email ? sentB2.get(email) : null
  const rpt = (email && reportByEmail.get(email)) || reportByName.get(key)
  const marketScan = rpt?.report?.marketScan
  const competitive = rpt?.report?.competitive

  const sentBatch = b1 ? 'morning (2pm)' : b2 ? 'evening (4pm)' : ''
  const subject = b1?.subject_line || b2?.subject_line || ''
  const reportUrl = b1?.report_url || b2?.report_url || ''

  // Sales ammo — pre-built copy for cold calls (auto-populated from the
  // prospect's own report data so Peter or a rep can just read it).
  const reportData = rpt?.report
  const compData = reportData?.competitive
  const topOppData = reportData?.opportunities?.[0]
  const actionStepData = reportData?.actionPlan?.[0]
  const cityName = rpt?.city || base?.city || enriched?.city || ''
  const reviewsNum = Number(compData?.yourReviewCount ?? base?.reviews ?? enriched?.reviews ?? 0)
  const marketAvgNum = Number(compData?.marketAvgReviewCount ?? 0)
  const rankNum = compData?.yourRank ?? ''
  const totalCompNum = compData?.totalCompetitors ?? ''
  const topCompName = compData?.competitors?.[0]?.name ?? ''
  const topCompReviews = compData?.competitors?.[0]?.reviewCount ?? 0
  const oppTitle = topOppData?.title ?? ''
  const oppDollar = topOppData?.monthlyValue ?? 0
  const actionStep1 = actionStepData?.title ?? ''
  // Project missed-call revenue: ~1.7 calls/missed per 10 reviews/month, $400 avg job
  const projectedMissedRevenue = Math.round(reviewsNum * 0.17 * 400)

  const openingLine = compData
    ? `Saw ${base?.business_name || enriched?.business_name || key} has ${reviewsNum} reviews ranking #${rankNum} of ${totalCompNum} in ${cityName}. Top spot is ${topCompName} at ${topCompReviews} reviews.`
    : ''

  const roiHook = reviewsNum > 0
    ? `${reviewsNum} reviews × ~17% missed calls @ $400/job = ~$${projectedMissedRevenue.toLocaleString()}/mo walking past the phone`
    : ''

  const top1Opportunity = oppDollar
    ? `Modeled +$${oppDollar.toLocaleString()}/mo from "${oppTitle}"`
    : ''

  const bestCallTime = rpt?.last_opened_at
    ? new Date(rpt.last_opened_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    : ''

  const ownerFirst = dbRow?.owner_first_name || ''
  const dialTemplate = compData ? [
    `Hey ${ownerFirst || 'there'}, this is Peter from BellAveGo.`,
    ``,
    `Not sure if you saw the email I sent — pulled a quick consulting report on ${base?.business_name || enriched?.business_name || key} in ${cityName}. Three things stood out:`,
    ``,
    `1. You're ranked #${rankNum} of ${totalCompNum} HVAC shops in ${cityName} with ${reviewsNum} reviews. Market average is ${marketAvgNum}.`,
    `2. "${oppTitle}" could add about $${oppDollar?.toLocaleString() ?? 0}/mo for a shop your size.`,
    `3. ${reviewsNum >= marketAvgNum ? "You're doing solid work" : "There's room to grow review volume"} - that is $${projectedMissedRevenue.toLocaleString()}/mo walking past the phone.`,
    ``,
    `Look — you're probably answering your own phone between jobs right now. Every missed call = missed money. We replace that for you so you can stay on the wrench AND book the job. Got 90 seconds for me to walk you through it?`,
  ].join('\n') : ''

  rows.push({
    business_name: base?.business_name || enriched?.business_name || key,
    phone: base?.phone || enriched?.phone || '',
    // Parse city from address as fallback so rows with missing city field still
    // land on the right city tab.
    city: base?.city || enriched?.city || (() => {
      const addr = base?.address || enriched?.address || ''
      const m = addr.match(/,\s*([A-Za-z][A-Za-z\s.'-]+),\s*[A-Z]{2}\s+\d{5}/)
      return m ? m[1].trim() : ''
    })(),
    state: base?.state || (() => {
      const addr = base?.address || enriched?.address || ''
      const m = addr.match(/,\s*([A-Z]{2})\s+\d{5}/)
      return m ? m[1] : 'Arizona'
    })(),
    address: base?.address || '',
    website: base?.website || enriched?.website || '',
    email,
    rating: Number(base?.rating ?? enriched?.rating ?? 0) || '',
    reviews: Number(base?.reviews ?? enriched?.reviews ?? 0) || 0,
    tier: base?.tier ?? enriched?.tier ?? '',
    recommended_plan: base?.recommended_plan || '',
    pitch_hook: (base?.pitch_hook || '').slice(0, 250),
    // 🎤 Sales Ammo — pre-built per-shop call ammunition
    opening_line: openingLine,
    top1_opportunity: top1Opportunity,
    roi_hook: roiHook,
    best_call_time: bestCallTime,
    action_step_1: actionStep1,
    dial_template: dialTemplate,
    homeowners_in_zip: marketScan?.homeownersInArea || '',
    median_income: marketScan?.medianIncome || '',
    median_home_age: marketScan?.medianHomeAge || '',
    addressable_monthly: marketScan?.addressableRevenueMonthly || '',
    your_rank: competitive?.yourRank || '',
    total_competitors_local: competitive?.totalCompetitors || '',
    top_competitor: competitive?.competitors?.[0]?.name || '',
    top_competitor_reviews: competitive?.competitors?.[0]?.reviewCount || '',
    sent_batch: sentBatch,
    sent_at: dbRow?.pushed_at || dbRow?.updated_at || '',
    sent_when: (() => {
      const at = dbRow?.pushed_at || dbRow?.updated_at
      if (!at) return ''
      const sent = new Date(at)
      const now = new Date()
      const sentDay = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate())
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const days = Math.floor((today - sentDay) / (24 * 60 * 60 * 1000))
      const time = sent.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      if (days === 0) return `TODAY ${time}`
      if (days === 1) return `YESTERDAY ${time}`
      if (days < 7) return `${days} days ago (${sent.toLocaleDateString('en-US', { weekday: 'short' })} ${time})`
      return sent.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    })(),
    status: dbRow?.status || (sentBatch ? 'sent' : 'not_emailed'),
    subject_line: subject,
    report_opens: Number(rpt?.open_count || 0),
    last_opened: rpt?.last_opened_at || '',
    // Follow-up tracking — these are user-editable in Excel. Run
    // scripts/import-outreach-edits.mjs to push edits back to DB.
    call_attempted_at: dbRow?.call_attempted_at || '',
    call_outcome: dbRow?.call_outcome || '',
    call_notes: dbRow?.call_notes || '',
    text_opt_in_at: dbRow?.text_opt_in_at || '',
    text_sent_at: dbRow?.text_sent_at || '',
    text_response_at: dbRow?.text_response_at || '',
    text_response: dbRow?.text_response || '',
    demo_booked_at: dbRow?.demo_booked_at || '',
    demo_outcome: dbRow?.demo_outcome || '',
    trial_started_at: dbRow?.trial_started_at || '',
    paid_at: dbRow?.paid_at || '',
    plan_tier_signed: dbRow?.plan_tier_signed || '',
    notes: dbRow?.notes || '',
    report_url: reportUrl,
  })
}

// Per Peter 5/28: rows without a valid email should NEVER appear in the
// master — they're unreachable noise that clutters the call session.
const PLACEHOLDER_EMAILS = [
  'example.com', 'example.org', 'domain.com', 'yourcompany.com',
  'your@', 'youremail@', 'name@', 'email@', 'test@', 'demo@', 'sample@',
  'noreply@', 'no-reply@', 'donotreply', 'bobsrepair.com', 'impallari@',
]
function hasValidEmail(e) {
  if (!e || typeof e !== 'string') return false
  if (!/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(e)) return false
  const low = e.toLowerCase()
  if (PLACEHOLDER_EMAILS.some((p) => low.includes(p))) return false
  const local = low.split('@')[0]
  if (/^\d+$/.test(local) || local.length > 30) return false
  return true
}
rows = rows.filter((r) => hasValidEmail(r.email))
console.log(`📧 After valid-email filter: ${rows.length} sendable leads (rest dropped — no usable email)`)

// Priority score 0-100. Hottest leads float to the top so the morning call
// session starts with shops most likely to convert.
function priorityScore(r) {
  let s = 0
  const opens = Number(r.report_opens || 0)
  s += opens * 25
  if (r.last_opened) {
    const hrs = (Date.now() - new Date(r.last_opened).getTime()) / (60 * 60 * 1000)
    if (hrs < 24) s += 30
    else if (hrs < 72) s += 15
  }
  if (r.call_outcome === 'interested') s += 40
  if (r.call_outcome === 'talked') s += 20
  if (r.status === 'positive_reply') s += 50
  if (r.status === 'objection') s += 15
  s += Math.min(10, Number(r.reviews || 0) / 10)
  if (r.recommended_plan === 'Pro $297') s += 5
  if (r.recommended_plan === 'Elite $597') s += 10
  if (r.call_outcome === 'not_interested') s -= 100
  if (r.call_outcome === 'hostile') s -= 100
  if (r.status === 'bounced') s -= 100
  if (r.status === 'dropped') s -= 100
  return Math.max(0, Math.min(100, Math.round(s)))
}

for (const r of rows) {
  r.priority_score = priorityScore(r)
  r.priority_tier = r.priority_score >= 80 ? '🔴 HOT — call now'
    : r.priority_score >= 50 ? '🟠 WARM — call today'
    : r.priority_score >= 20 ? '🟡 INTERESTED'
    : r.sent_batch ? '⚪ COLD'
    : '— not sent'
}
// Peter's 5/28 sort + color system:
//   1 (top, light blue)    = unsent      → queue review / send next
//   2 (light green)        = sent <24h   → just sent, let email land
//   3 (DARK GREEN)         = sent 24h+   → CALL NOW (small dog, had time to read)
//   4 (bottom, pale yellow)= big boy (150+ reviews) → skip but keep for dedup
function sortTier(r) {
  const sentAt = r.sent_at ? new Date(r.sent_at).getTime() : 0
  const reviewCt = Number(r.reviews || 0)
  const isBigBoy = reviewCt >= 150
  if (!sentAt) return 1
  if (isBigBoy) return 4
  const hrs = (Date.now() - sentAt) / (60 * 60 * 1000)
  if (hrs < 24) return 2
  return 3
}
for (const r of rows) r._sortTier = sortTier(r)
rows.sort((a, b) => {
  if (a._sortTier !== b._sortTier) return a._sortTier - b._sortTier
  // Within tier: sent rows newest first, unsent by review count desc
  const aSent = a.sent_at ? new Date(a.sent_at).getTime() : 0
  const bSent = b.sent_at ? new Date(b.sent_at).getTime() : 0
  if (aSent && bSent) return bSent - aSent
  return Number(b.reviews || 0) - Number(a.reviews || 0)
})

// ── Build workbook ─────────────────────────────────────────────
const wb = new ExcelJS.Workbook()
wb.creator = 'BellAveGo · Jarvis'
wb.created = new Date()

const ws = wb.addWorksheet('Master - All Cities', {
  views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }], // freeze top 3 rows + first col
})

// Row 1: BellAveGo branded title
ws.mergeCells('A1:AB1')
const titleCell = ws.getCell('A1')
titleCell.value = 'BellAveGo — Cold Outreach Master (All Cities)'
titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } }
titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } } // navy
ws.getRow(1).height = 36

// Row 2: section headers
const sections = [
  { name: 'IDENTITY', span: 5, color: 'FF0B1F3A' },     // navy
  { name: 'CONTACT', span: 2, color: 'FF0AA89F' },      // teal
  { name: 'QUALITY', span: 5, color: 'FFE8742B' },      // orange
  { name: '🎤 SALES AMMO — read off screen', span: 6, color: 'FF7C3AED' }, // purple (cold-call ammo)
  { name: 'DEMOGRAPHICS (ZIP)', span: 4, color: 'FFCB9F2E' },  // gold
  { name: 'COMPETITIVE', span: 4, color: 'FF8B5A2B' },  // brown
  { name: '🎯 PRIORITY', span: 2, color: 'FFB91C1C' },   // red — most important
  { name: 'OUTREACH', span: 4, color: 'FF0B1F3A' },     // navy
  { name: 'PERFORMANCE', span: 2, color: 'FF2E7D32' },  // green
  { name: '☎ CALL — log here', span: 3, color: 'FF6B21A8' },    // purple (editable)
  { name: '📱 TEXT — log here', span: 4, color: 'FFBE185D' },   // pink (editable)
  { name: '🎯 CLOSE — log here', span: 4, color: 'FF166534' },  // dark green (editable)
  { name: 'NOTES', span: 2, color: 'FF334155' },       // slate (editable)
  { name: 'LINK', span: 1, color: 'FF666666' },         // gray
]
let colIdx = 1
for (const s of sections) {
  const startCol = colIdx
  const endCol = colIdx + s.span - 1
  ws.mergeCells(2, startCol, 2, endCol)
  const cell = ws.getCell(2, startCol)
  cell.value = s.name
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.color } }
  cell.border = { right: { style: 'medium', color: { argb: 'FFFFFFFF' } } }
  colIdx = endCol + 1
}
ws.getRow(2).height = 22

// Row 3: column headers
const columns = [
  // IDENTITY
  { header: 'Business Name', key: 'business_name', width: 32 },
  { header: 'City', key: 'city', width: 14 },
  { header: 'State', key: 'state', width: 8 },
  { header: 'Address', key: 'address', width: 32 },
  { header: 'Website', key: 'website', width: 30 },
  // CONTACT
  { header: 'Phone', key: 'phone', width: 16 },
  { header: 'Email', key: 'email', width: 32 },
  // QUALITY
  { header: 'Rating', key: 'rating', width: 8 },
  { header: 'Reviews', key: 'reviews', width: 9 },
  { header: 'Tier', key: 'tier', width: 6 },
  { header: 'Plan Fit', key: 'recommended_plan', width: 14 },
  { header: 'Pitch Hook', key: 'pitch_hook', width: 50 },
  // 🎤 SALES AMMO (pre-built call ammo per shop)
  { header: 'Opening Line', key: 'opening_line', width: 60 },
  { header: 'Their #1 Opportunity', key: 'top1_opportunity', width: 40 },
  { header: 'ROI Hook ($missed/mo)', key: 'roi_hook', width: 50 },
  { header: 'Best Call Time', key: 'best_call_time', width: 18 },
  { header: 'Action Plan Step 1', key: 'action_step_1', width: 40 },
  { header: 'Dial Template (read it)', key: 'dial_template', width: 75 },
  // DEMOGRAPHICS
  { header: 'Homeowners', key: 'homeowners_in_zip', width: 12 },
  { header: 'Median Income', key: 'median_income', width: 14 },
  { header: 'Home Age', key: 'median_home_age', width: 10 },
  { header: '$ Addressable/mo', key: 'addressable_monthly', width: 16 },
  // COMPETITIVE
  { header: 'Your Rank', key: 'your_rank', width: 9 },
  { header: 'Total Comp', key: 'total_competitors_local', width: 11 },
  { header: 'Top Competitor', key: 'top_competitor', width: 28 },
  { header: 'Top Comp Reviews', key: 'top_competitor_reviews', width: 14 },
  // 🎯 PRIORITY (computed from opens + call outcome + status)
  { header: 'Score', key: 'priority_score', width: 8 },
  { header: 'Tier', key: 'priority_tier', width: 14 },
  // OUTREACH
  { header: 'Sent When', key: 'sent_when', width: 16 }, // human-friendly relative date
  { header: 'Batch', key: 'sent_batch', width: 16 },
  { header: 'Sent At', key: 'sent_at', width: 18 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'Subject Line', key: 'subject_line', width: 50 },
  // PERFORMANCE
  { header: 'Report Opens', key: 'report_opens', width: 13 },
  { header: 'Last Opened', key: 'last_opened', width: 18 },
  // ☎ CALL (editable)
  { header: 'Call At', key: 'call_attempted_at', width: 16 },
  { header: 'Call Outcome', key: 'call_outcome', width: 16 },
  { header: 'Call Notes', key: 'call_notes', width: 40 },
  // 📱 TEXT (editable)
  { header: 'Text Opt-In', key: 'text_opt_in_at', width: 14 },
  { header: 'Text Sent', key: 'text_sent_at', width: 14 },
  { header: 'Text Response At', key: 'text_response_at', width: 16 },
  { header: 'Text Response', key: 'text_response', width: 40 },
  // 🎯 CLOSE (editable)
  { header: 'Demo Booked', key: 'demo_booked_at', width: 14 },
  { header: 'Demo Outcome', key: 'demo_outcome', width: 14 },
  { header: 'Trial Started', key: 'trial_started_at', width: 14 },
  { header: 'Paid', key: 'paid_at', width: 14 },
  // NOTES (editable)
  { header: 'Plan Signed', key: 'plan_tier_signed', width: 14 },
  { header: 'Notes', key: 'notes', width: 40 },
  // LINK
  { header: 'Report URL', key: 'report_url', width: 30 },
]
ws.columns = columns.map((c) => ({ ...c, key: c.key }))

// Fix row 3 (header) formatting since columns.header writes there
const headerRow = ws.getRow(3)
headerRow.values = columns.map((c) => c.header)
headerRow.eachCell((cell) => {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
  cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } } // slate
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    bottom: { style: 'medium', color: { argb: 'FF0B1F3A' } },
  }
})
headerRow.height = 32

// ── Data rows with status-based row fill ───────────────────────
const STATUS_COLORS = {
  bounced: 'FFFEE2E2',          // red-50
  positive_reply: 'FFFED7AA',   // orange-200 hot lead
  objection: 'FFFEF3C7',        // amber-100
  dropped: 'FFE5E7EB',          // gray-200
  sent_opened: 'FFD1FAE5',      // green-100 (sent + report opens > 0)
  sent: 'FFDBEAFE',             // blue-100
  not_emailed: 'FFF9FAFB',      // gray-50
}

let writtenRows = 0
for (const r of rows) {
  const opened = Number(r.report_opens || 0) > 0
  const statusKey = r.status === 'sent' && opened ? 'sent_opened' : (r.status || 'not_emailed')
  // Peter's 5/28 color system based on sort tier:
  //   tier 1: light blue   = unsent (queue)
  //   tier 2: light green  = sent <24h to small dog (wait)
  //   tier 3: DARK GREEN   = sent 24h+ to small dog (CALL NOW)
  //   tier 4: pale yellow  = big boy (skip but dedup)
  const tierColor = {
    1: 'FFBFDBFE', // light blue
    2: 'FFBBF7D0', // light green
    3: 'FF15803D', // dark green
    4: 'FFFFF59D', // pale yellow
  }
  const fillColor = tierColor[r._sortTier] || STATUS_COLORS.not_emailed

  const excelRow = ws.addRow(r)
  excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
    cell.alignment = { vertical: 'top', wrapText: true }
    cell.font = { size: 10 }
    cell.border = {
      bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
      right: { style: 'hair', color: { argb: 'FFF3F4F6' } },
    }
  })

  // Format number columns
  ws.getCell(`H${excelRow.number}`).numFmt = '0.0'
  ws.getCell(`I${excelRow.number}`).numFmt = '#,##0'
  ws.getCell(`M${excelRow.number}`).numFmt = '#,##0'
  ws.getCell(`N${excelRow.number}`).numFmt = '"$"#,##0'
  ws.getCell(`P${excelRow.number}`).numFmt = '"$"#,##0'
  ws.getCell(`T${excelRow.number}`).numFmt = '#,##0'

  // Status cell bold — Status column moved to Y after adding PRIORITY (U,V)
  ws.getCell(`Y${excelRow.number}`).font = { size: 10, bold: true }

  // PRIORITY cells: bold + color the tier label by hotness
  const scoreCell = ws.getCell(`U${excelRow.number}`)
  scoreCell.font = { size: 11, bold: true, color: { argb: 'FF0B1F3A' } }
  scoreCell.alignment = { horizontal: 'center', vertical: 'middle' }
  const tierCell = ws.getCell(`V${excelRow.number}`)
  tierCell.font = { size: 10, bold: true,
    color: { argb:
      r.priority_score >= 80 ? 'FFFFFFFF' :
      r.priority_score >= 50 ? 'FFFFFFFF' :
      r.priority_score >= 20 ? 'FF78350F' :
      'FF6B7280'
    }
  }
  tierCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb:
    r.priority_score >= 80 ? 'FFDC2626' :   // red — HOT
    r.priority_score >= 50 ? 'FFEA580C' :   // orange — WARM
    r.priority_score >= 20 ? 'FFFEF3C7' :   // amber — INTERESTED
    'FFF3F4F6'                              // gray — COLD
  } }
  tierCell.alignment = { horizontal: 'center', vertical: 'middle' }

  // Hyperlink columns
  if (r.website) {
    const c = ws.getCell(`E${excelRow.number}`)
    c.value = { text: r.website, hyperlink: r.website }
    c.font = { size: 10, color: { argb: 'FF0AA89F' }, underline: true }
  }
  if (r.email) {
    const c = ws.getCell(`G${excelRow.number}`)
    c.value = { text: r.email, hyperlink: `mailto:${r.email}` }
    c.font = { size: 10, color: { argb: 'FF0AA89F' }, underline: true }
  }
  if (r.phone) {
    const c = ws.getCell(`F${excelRow.number}`)
    c.value = { text: r.phone, hyperlink: `tel:${String(r.phone).replace(/[^\d+]/g, '')}` }
    c.font = { size: 10, color: { argb: 'FF0AA89F' }, underline: true, bold: true }
  }
  if (r.report_url) {
    // Report URL column moved to AP (after adding 2 priority + 13 followup cols)
    const c = ws.getCell(`AP${excelRow.number}`)
    c.value = { text: 'open report →', hyperlink: r.report_url }
    c.font = { size: 9, color: { argb: 'FFE8742B' }, underline: true }
  }

  writtenRows++
}

// ── Legend row at bottom ───────────────────────────────────────
const legendStart = writtenRows + 5
ws.mergeCells(`A${legendStart}:H${legendStart}`)
ws.getCell(`A${legendStart}`).value = 'LEGEND (row color = status)'
ws.getCell(`A${legendStart}`).font = { bold: true, size: 11, color: { argb: 'FF0B1F3A' } }

const legendItems = [
  { label: '🔵 LIGHT BLUE — UNSENT — queue to send next batch (TOP of list)', fill: 'FFBFDBFE' },
  { label: '🟢 LIGHT GREEN — Sent TODAY to small dog — email just landed, give it 24h', fill: 'FFBBF7D0' },
  { label: '🟩 DARK GREEN — Sent 24h+ ago to small dog — CALL NOW, they had time to read', fill: 'FF15803D' },
  { label: '🟡 PALE YELLOW — Big boy (150+ reviews, has receptionist already) — SKIP but keep for dedup (BOTTOM)', fill: 'FFFFF59D' },
  { label: '🟠 Positive reply (hot lead — call ASAP)', fill: STATUS_COLORS.positive_reply },
  { label: '🔴 Bounced (skip)', fill: STATUS_COLORS.bounced },
]
legendItems.forEach((item, i) => {
  const rowN = legendStart + 1 + i
  const c1 = ws.getCell(`A${rowN}`)
  c1.value = ''
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.fill } }
  c1.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  const c2 = ws.getCell(`B${rowN}`)
  c2.value = item.label
  c2.font = { size: 10 }
})

// Auto-filter on data rows
ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: writtenRows + 3, column: columns.length } }

// ─────────────────────────────────────────────────────────────
// Per-city tabs (Peter's 5/28 ask): one sheet per city so call sessions
// can focus on one market at a time. Each city sheet uses the same
// column schema but is a flat data table — no fancy headers, just rows
// sorted newest-sent first, yellow highlight for last-48h sends.
// ─────────────────────────────────────────────────────────────

function normCity(c) {
  if (!c) return 'Unknown'
  return String(c).trim().split(',')[0]
}

const byCity = new Map()
for (const r of rows) {
  const key = normCity(r.city)
  if (!byCity.has(key)) byCity.set(key, [])
  byCity.get(key).push(r)
}

// Only build a tab if the city has 3+ rows — avoids cluttering with one-offs.
const cityNames = [...byCity.keys()].filter((c) => byCity.get(c).length >= 3 && c !== 'Unknown')
cityNames.sort((a, b) => byCity.get(b).length - byCity.get(a).length)

for (const city of cityNames) {
  const cityRows = byCity.get(city)
  // Sort newest sent first within this city, then unsent by reviews desc.
  cityRows.sort((a, b) => {
    const aSent = a.sent_at ? new Date(a.sent_at).getTime() : 0
    const bSent = b.sent_at ? new Date(b.sent_at).getTime() : 0
    if (aSent && bSent) return bSent - aSent
    if (aSent && !bSent) return -1
    if (!aSent && bSent) return 1
    return Number(b.reviews || 0) - Number(a.reviews || 0)
  })

  const cs = wb.addWorksheet(city.slice(0, 31), { // sheet name max 31 chars
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  })
  cs.columns = columns.map((c) => ({ ...c }))
  cs.getRow(1).values = columns.map((c) => c.header)
  cs.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  cs.getRow(1).height = 28

  for (const r of cityRows) {
    const excelRow = cs.addRow(r)
    const sentTs = r.sent_at ? new Date(r.sent_at).getTime() : 0
    const isRecentSend = sentTs > 0 && (Date.now() - sentTs) < 48 * 60 * 60 * 1000
    const tier = r.priority_score >= 80 ? 'sent_opened'
      : r.status === 'bounced' ? 'bounced'
      : r.sent_at ? 'sent'
      : 'not_emailed'
    const tierColor = { 1: 'FFBFDBFE', 2: 'FFBBF7D0', 3: 'FF15803D', 4: 'FFFFF59D' }
    const fill = tierColor[r._sortTier] || STATUS_COLORS.not_emailed
    excelRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.font = { size: 10 }
    })
  }
  cs.autoFilter = { from: { row: 1, column: 1 }, to: { row: cityRows.length + 1, column: columns.length } }
}

// Save
const outPath = path.join(ROOT, 'outreach-master.xlsx')
await wb.xlsx.writeFile(outPath)

// Summary
const sent = rows.filter((r) => r.sent_batch).length
const opened = rows.filter((r) => Number(r.report_opens) > 0).length
const replied = rows.filter((r) => r.status === 'positive_reply' || r.status === 'objection').length
const bounced = rows.filter((r) => r.status === 'bounced').length

console.log(`✅ Saved ${outPath}`)
console.log(`   Total rows: ${writtenRows}`)
console.log(`   🔵 Sent: ${sent}`)
console.log(`   🟢 Opened: ${opened}`)
console.log(`   🟠 Replied: ${replied}`)
console.log(`   🔴 Bounced: ${bounced}`)
console.log(`   ⚪ Not emailed yet: ${writtenRows - sent}`)
console.log(`\nOpen with: powershell -c "Invoke-Item '${outPath}'"`)
