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

const baseRows = readCSV(path.join(ROOT, 'arizona-hvac-top-100.csv'))
const emailRows = readCSV(path.join(ROOT, 'arizona-hvac-top-100-with-emails.csv'))
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

const rows = []
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

  rows.push({
    business_name: base?.business_name || enriched?.business_name || key,
    phone: base?.phone || enriched?.phone || '',
    city: base?.city || enriched?.city || '',
    state: base?.state || 'Arizona',
    address: base?.address || '',
    website: base?.website || enriched?.website || '',
    email,
    rating: Number(base?.rating ?? enriched?.rating ?? 0) || '',
    reviews: Number(base?.reviews ?? enriched?.reviews ?? 0) || 0,
    tier: base?.tier ?? enriched?.tier ?? '',
    recommended_plan: base?.recommended_plan || '',
    pitch_hook: (base?.pitch_hook || '').slice(0, 250),
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

// Sort: sent first, then by reviews desc
rows.sort((a, b) => {
  if (a.sent_batch && !b.sent_batch) return -1
  if (!a.sent_batch && b.sent_batch) return 1
  return Number(b.reviews || 0) - Number(a.reviews || 0)
})

// ── Build workbook ─────────────────────────────────────────────
const wb = new ExcelJS.Workbook()
wb.creator = 'BellAveGo · Jarvis'
wb.created = new Date()

const ws = wb.addWorksheet('Arizona HVAC Prospects', {
  views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }], // freeze top 3 rows + first col
})

// Row 1: BellAveGo branded title
ws.mergeCells('A1:AB1')
const titleCell = ws.getCell('A1')
titleCell.value = 'BellAveGo — Arizona HVAC Outreach Master'
titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } }
titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } } // navy
ws.getRow(1).height = 36

// Row 2: section headers
const sections = [
  { name: 'IDENTITY', span: 5, color: 'FF0B1F3A' },     // navy
  { name: 'CONTACT', span: 2, color: 'FF0AA89F' },      // teal
  { name: 'QUALITY', span: 5, color: 'FFE8742B' },      // orange
  { name: 'DEMOGRAPHICS (ZIP)', span: 4, color: 'FFCB9F2E' },  // gold
  { name: 'COMPETITIVE', span: 4, color: 'FF8B5A2B' },  // brown
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
  // OUTREACH
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
  const fillColor = STATUS_COLORS[statusKey] || STATUS_COLORS.not_emailed

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

  // Status cell bold
  ws.getCell(`W${excelRow.number}`).font = { size: 10, bold: true }

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
    const c = ws.getCell(`AB${excelRow.number}`)
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
  { label: '🟢 Sent + report opened', fill: STATUS_COLORS.sent_opened },
  { label: '🔵 Sent + no open yet', fill: STATUS_COLORS.sent },
  { label: '🟠 Positive reply (hot lead — call ASAP)', fill: STATUS_COLORS.positive_reply },
  { label: '🟡 Objection (engaged but pushback)', fill: STATUS_COLORS.objection },
  { label: '🔴 Bounced (skip)', fill: STATUS_COLORS.bounced },
  { label: '⚪ Not emailed yet (queue for tomorrow)', fill: STATUS_COLORS.not_emailed },
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
