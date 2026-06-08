#!/usr/bin/env node
/**
 * build-tomorrow-xlsx.mjs
 *
 * Builds Peter's morning xlsx for the NEXT dial day. Priority logic:
 *
 *   Sheet 1: DAY-2 CALLBACKS — warm leads from yesterday tagged "sent" or
 *            with notes containing "sent" / "report" / interest signals.
 *            These are dialed FIRST tomorrow morning. Highest close-rate
 *            calls in the entire pipeline.
 *
 *   Sheet 2: TODAY'S FRESH DIALS — clean 200+ leads from the new
 *            outreach_leads queued in last 24h (daily-200 cron output).
 *
 *   Sheet 3: READ FIRST — playbook reference.
 *
 * Both dial sheets use the pain-framing opener + ICP-clean filter.
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const APP = 'https://www.bellavego.com'
const ADMIN_SECRET = process.env.ADMIN_API_SECRET
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const today = new Date().toISOString().slice(0, 10)

function isNonContractorTrash(name) {
  if (!name) return false
  const n = name.toLowerCase()
  return [
    'supply', 'supplies', 'distributor', 'wholesale',
    'institute', 'training', 'academy', 'school',
    'rentals', 'rental ', 'products co', 'products inc',
    'sales office', 'trade office', 'corporate',
  ].some((t) => n.includes(t))
}

function painOpener(biz, city) {
  return (
    `"Hey, real quick — do you guys ever struggle to answer phone calls when you're out on jobs? You know how it is in HVAC — one missed call is $450 walking out the door. ` +
    `Just calling around — built a free 1-page report showing what shops in ${city || 'your area'} are losing every month. Want me to text it to you?"`
  )
}

function day2Opener(biz) {
  return (
    `"Hey, this is Peter McShane again — calling back about that BellAveGo market report I sent for ${biz} yesterday. Did you get a chance to look at it? Any of the numbers surprise you?" ` +
    `[IF YES] "We help small HVAC shops catch those exact missed calls. It's $147/mo, free 7-day trial, your number stays the same. Want to see how it works?"`
  )
}

// ── PULL DAY-2 LEADS (yesterday's "sent" / warm-tagged calls) ──
// Reads the v3 xlsx Peter edited today and extracts rows where the
// outcome column says "RPT" or notes contain "sent", "interested", etc.
async function extractWarmLeadsFromXlsx() {
  // Look in Peter's Downloads folder first (where he edits), fallback
  // to ringoco/leads and OneDrive.
  // Search every dial-list xlsx Peter has touched today; pick the one with
  // actual filled-in notes (not the freshly auto-generated one which has
  // a newer mtime but zero notes).
  const candidates = [
    `C:\\Users\\peter\\Downloads\\dial-list-with-script-${today}-v2.xlsx`,
    `C:\\Users\\peter\\Downloads\\dial-list-with-script-${today}-v3.xlsx`,
    `C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads\\dial-list-with-script-${today}-v2.xlsx`,
    `C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads\\dial-list-with-script-${today}-v3.xlsx`,
  ]
  let xlsxPath = null
  let mostNotes = 0
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue
    // Quick scan — count cells in column 8 with non-empty content
    try {
      const tmp = new ExcelJS.Workbook()
      await tmp.xlsx.readFile(p)
      const ws = tmp.getWorksheet(`Dial List ${today}`)
      if (!ws) continue
      let count = 0
      for (let r = 2; r <= 500; r++) {
        const v = ws.getRow(r).getCell(8).value
        const s = (typeof v === 'object' && v ? (v.text || (v.richText || []).map((t) => t.text).join('') || '') : (v || '').toString()).trim()
        if (s) count++
      }
      if (count > mostNotes) {
        mostNotes = count
        xlsxPath = p
      }
    } catch { /* skip */ }
  }
  if (!xlsxPath) {
    console.log(`  ⚠ No today xlsx found — Day-2 sheet will be empty`)
    return []
  }
  console.log(`  Reading warm leads from: ${xlsxPath}`)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxPath)
  const ws = wb.getWorksheet(`Dial List ${today}`)
  if (!ws) return []

  // Find column indexes dynamically
  let notesCol = 0, outcomeCol = 0, bizCol = 0, phoneCol = 0, cityCol = 0, stateCol = 0, revCol = 0
  ws.getRow(1).eachCell((cell, i) => {
    const v = (cell.value || '').toString().toLowerCase()
    if (v.includes('notes')) notesCol = i
    if (v.includes('outcome')) outcomeCol = i
    if (v.includes('business')) bizCol = i
    if (v.includes('tap to call')) phoneCol = i
    if (v === 'city') cityCol = i
    if (v === 'st') stateCol = i
    if (v.includes('rev')) revCol = i
  })

  const warm = []
  for (let r = 2; r <= 500; r++) {
    const row = ws.getRow(r)
    const biz = (row.getCell(bizCol).value || '').toString()
    if (!biz) break
    const notes = row.getCell(notesCol).value
    const outcome = (row.getCell(outcomeCol).value || '').toString().toLowerCase()
    const notesStr = (typeof notes === 'object' && notes ? (notes.text || (notes.richText || []).map((t) => t.text).join('') || '') : (notes || '').toString()).toLowerCase()

    // Tag as warm if outcome OR notes contain "sent" / "report" / interest signals
    const isWarm =
      outcome.includes('rpt') ||
      outcome.includes('sent') ||
      notesStr.includes('sent') ||
      notesStr.includes('interested') ||
      notesStr.includes('warm') ||
      notesStr.includes('callback') ||
      notesStr.includes('transfer over')

    if (isWarm) {
      // Get phone — handle hyperlink cell
      const phoneCell = row.getCell(phoneCol).value
      const phone = typeof phoneCell === 'object' && phoneCell ? phoneCell.text || phoneCell.hyperlink?.replace('tel:', '') : (phoneCell || '').toString()

      warm.push({
        business_name: biz,
        owner_phone: phone,
        city: (row.getCell(cityCol).value || '').toString(),
        state: (row.getCell(stateCol).value || '').toString(),
        open_count: row.getCell(revCol).value,
        prior_notes: notesStr.slice(0, 200),
        prior_outcome: outcome,
      })
    }
  }
  return warm
}

// ── PULL TODAY'S FRESH LEADS (any unhad batch in DB) ──
async function getFreshLeads() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('outreach_leads')
    .select('id, business_name, owner_phone, owner_first_name, email, city, state, trade, open_count, campaign_id, notes')
    .gte('pushed_at', yesterday)
    .not('owner_phone', 'is', null)
    .order('open_count', { ascending: true, nullsFirst: false })
    .limit(400)
  return (data || []).filter((l) => !isNonContractorTrash(l.business_name))
}

const warmLeads = await extractWarmLeadsFromXlsx()
const freshLeads = await getFreshLeads()
console.log(`  Day-2 callbacks: ${warmLeads.length}`)
console.log(`  Fresh dials:     ${freshLeads.length}`)

// ── BUILD XLSX ──
const wb = new ExcelJS.Workbook()
wb.creator = 'BellAveGo · Path-Y'
wb.created = new Date()

// SHEET 1 — Day-2 Callbacks (warm leads at top, highest priority)
const day2 = wb.addWorksheet('🔥 DAY-2 CALLBACKS (DIAL FIRST)', {
  views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }],
})
day2.columns = [
  { header: '#', key: 'idx', width: 4 },
  { header: 'Business', key: 'business_name', width: 30 },
  { header: '📞 TAP TO CALL', key: 'phone_link', width: 18 },
  { header: 'City', key: 'city', width: 14 },
  { header: 'St', key: 'state', width: 4 },
  { header: '⭐#Rev', key: 'open_count', width: 6 },
  { header: '📝 YESTERDAY\'S NOTES', key: 'prior_notes', width: 40 },
  { header: '🔁 DAY-2 OPENER (verbatim)', key: 'opener', width: 90 },
  { header: '📝 TODAY\'S NOTES', key: 'today_notes', width: 30 },
  { header: 'Outcome', key: 'outcome', width: 12 },
]
day2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
day2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8742B' } }
day2.getRow(1).height = 32

let i = 1
for (const l of warmLeads) {
  const row = day2.addRow({
    idx: i,
    business_name: l.business_name,
    phone_link: l.owner_phone,
    city: l.city,
    state: l.state,
    open_count: l.open_count,
    prior_notes: l.prior_notes,
    opener: day2Opener(l.business_name),
    today_notes: '',
    outcome: '',
  })
  const phoneCell = row.getCell('phone_link')
  phoneCell.value = { text: l.owner_phone, hyperlink: `tel:${l.owner_phone}` }
  phoneCell.font = { color: { argb: 'FF0066CC' }, underline: true, bold: true, size: 12 }
  row.getCell('opener').alignment = { vertical: 'top', wrapText: true }
  row.getCell('opener').font = { size: 10 }
  row.getCell('prior_notes').alignment = { vertical: 'top', wrapText: true }
  row.getCell('prior_notes').font = { size: 9, color: { argb: 'FF7A4A00' }, italic: true }
  row.height = 80
  i++
}

// SHEET 2 — Today's Fresh Dials (pain opener)
const fresh = wb.addWorksheet(`Fresh Dials ${tomorrow}`, {
  views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }],
})
fresh.columns = [
  { header: '#', key: 'idx', width: 4 },
  { header: 'Business', key: 'business_name', width: 28 },
  { header: '📞 TAP TO CALL', key: 'phone_link', width: 18 },
  { header: 'City', key: 'city', width: 12 },
  { header: 'St', key: 'state', width: 4 },
  { header: '⭐#Rev', key: 'open_count', width: 6 },
  { header: '🔥 OPENER (verbatim)', key: 'opener', width: 100 },
  { header: '📝 NOTES (fill after call)', key: 'notes_col', width: 30 },
  { header: '📲 SMS REPORT URL (copy → paste)', key: 'send_report_link', width: 80 },
  { header: 'Outcome', key: 'outcome', width: 12 },
]
fresh.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
fresh.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0AA89F' } }
fresh.getRow(1).height = 32

let j = 1
for (const l of freshLeads) {
  const qs = new URLSearchParams({
    for: l.business_name || '',
    ...(l.city && { city: l.city }),
    ...(l.trade && { type: l.trade }),
  })
  const reportUrl = `${APP}/sample-report?${qs.toString()}`

  const row = fresh.addRow({
    idx: j,
    business_name: l.business_name,
    phone_link: l.owner_phone,
    city: l.city,
    state: l.state,
    open_count: l.open_count ?? '',
    opener: painOpener(l.business_name, l.city),
    notes_col: '',
    send_report_link: reportUrl,
    outcome: '',
  })
  const phoneCell = row.getCell('phone_link')
  phoneCell.value = { text: l.owner_phone, hyperlink: `tel:${l.owner_phone}` }
  phoneCell.font = { color: { argb: 'FF0066CC' }, underline: true, bold: true, size: 12 }
  row.getCell('opener').alignment = { vertical: 'top', wrapText: true }
  row.getCell('opener').font = { size: 10 }
  row.getCell('send_report_link').alignment = { vertical: 'middle', wrapText: true }
  row.getCell('send_report_link').font = { size: 9, color: { argb: 'FFE8742B' } }
  row.height = 90
  j++
}

// SHEET 3 — Read First
const inst = wb.addWorksheet('READ FIRST')
inst.columns = [{ header: 'BellAveGo Path-Y Playbook v3', key: 'l', width: 100 }]
inst.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
inst.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } }
const playbookLines = [
  '',
  '🎯 ORDER OF OPERATIONS:',
  '  1. Dial DAY-2 CALLBACKS sheet first (warm leads — highest close rate)',
  '  2. Then move to Fresh Dials sheet',
  '  3. Goal: 150 dials total Mon-Sat',
  '',
  '🔥 OPENER (memorize the structure, vary words):',
  '  "Do you guys struggle answering phone calls when on the job?"',
  '  "In HVAC, one missed call = $450 gone."',
  '  "Built a free 1-pg report on what shops in [CITY] are losing."',
  '  "Want me to text it?"',
  '',
  '📞 PERMISSION TO TEXT = THE WIN. Don\'t pitch AI receptionist on call #1.',
  '',
  '📝 NOTES — 3 WORDS MAX:',
  '  "ring no answer" / "rejected fast" / "SENT first-name" / "gatekeeper too-big" /',
  '  "wife of owner sent" / "callback Sat 9am"',
  '',
  '🔁 DAY-2 = WHERE THE DEAL CLOSES:',
  '  Call warm leads back BEFORE fresh dials each morning',
  '  9am PST = best reach window',
  '',
  '🎯 TODAY\'S TARGETS:',
  '  150 dials',
  '  25-35 reports SENT (if pain opener lands)',
  '  2-3 demos booked',
  '  1+ trial started',
]
for (const line of playbookLines) inst.addRow({ l: line })

const OUT = `C:\\Users\\peter\\ringoco\\leads\\dial-list-${tomorrow}.xlsx`
await wb.xlsx.writeFile(OUT)
try {
  fs.copyFileSync(OUT, `C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads\\dial-list-${tomorrow}.xlsx`)
  fs.copyFileSync(OUT, `C:\\Users\\peter\\Downloads\\dial-list-${tomorrow}.xlsx`)
} catch (e) {
  console.warn('Copy failed: ' + e.message)
}

console.log(`\n  ✅ Tomorrow xlsx ready: ${OUT}`)
console.log(`  Sheet 1: 🔥 DAY-2 CALLBACKS (dial first) — ${warmLeads.length} warm leads`)
console.log(`  Sheet 2: Fresh Dials ${tomorrow} — ${freshLeads.length} leads`)
console.log(`  Sheet 3: READ FIRST — playbook v3`)
