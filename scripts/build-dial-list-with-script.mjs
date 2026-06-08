#!/usr/bin/env node
/**
 * build-dial-list-with-script.mjs
 *
 * Reads all leads scraped today from outreach_leads and writes a
 * dial-ready xlsx where each row includes the PRE-RENDERED Path-Y
 * cold-call opener with the prospect's real business name, city, and
 * review count baked in. Peter taps phone column, opener is right
 * there — no improvisation, no script-recall friction.
 *
 * Also includes Day-2 callback opener for the post-report follow-up.
 *
 * Output:
 *   leads/dial-list-with-script-{date}.xlsx
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

const today = new Date().toISOString().slice(0, 10)

// Pull all leads inserted in last 24h with status='queued' or 'in_instantly_queue'
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const { data: leads, error } = await supabase
  .from('outreach_leads')
  .select('id, business_name, owner_phone, owner_first_name, email, city, state, trade, open_count, campaign_id, notes')
  .gte('pushed_at', yesterday)
  .not('owner_phone', 'is', null)
  .order('open_count', { ascending: true, nullsFirst: false })

if (error) {
  console.error(error)
  process.exit(1)
}

// ICP filter: drop suppliers, institutes, sales offices, rentals — none
// of these are HVAC contractor shops that can use BellAveGo. Caught from
// Peter's first 50 dials where 12% of the list was these noise rows.
const preFilterCount = leads.length
const filteredLeads = leads.filter((l) => !isNonContractorTrash(l.business_name))
const droppedCount = preFilterCount - filteredLeads.length
console.log(`Found ${preFilterCount} dial-ready leads · dropped ${droppedCount} non-contractor trash · ${filteredLeads.length} clean`)
leads.length = 0
leads.push(...filteredLeads)

function buildOpener(lead) {
  const biz = lead.business_name || 'your shop'
  const city = lead.city || 'your area'

  return (
    `"Hey, real quick — do you guys ever struggle to answer phone calls when you're out on jobs? You know how it is in HVAC — one missed call is $450 walking out the door. ` +
    `Just calling around — built a free 1-page report showing what shops in ${city} are losing every month. Want me to text it to you?"`
  )
}

function isNonContractorTrash(businessName) {
  if (!businessName) return false
  const n = businessName.toLowerCase()
  const trash = [
    'supply', 'supplies', 'distributor', 'wholesale',
    'institute', 'training', 'academy', 'school',
    'rentals', 'rental ',
    'products co', 'products inc',
    'sales office', 'trade office',
    'corporate', 'headquarters', 'corp.',
  ]
  return trash.some((t) => n.includes(t))
}

function buildDay2(lead) {
  const biz = lead.business_name || 'your shop'
  return (
    `"Hey, Peter McShane again — calling back about that BellAveGo market report I sent for ${biz}. Any of the numbers surprise you?" ` +
    `[IF YES] "We help small HVAC shops catch those exact missed calls. It's $147/mo, free 7-day trial, your number stays the same. Want to see how it works?"`
  )
}

const wb = new ExcelJS.Workbook()
wb.creator = 'BellAveGo · Path-Y'
wb.created = new Date()

const ws = wb.addWorksheet(`Dial List ${today}`, {
  views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }],
})
ws.columns = [
  { header: '#', key: 'idx', width: 4 },
  { header: 'Business', key: 'business_name', width: 28 },
  { header: '📞 TAP TO CALL', key: 'phone_link', width: 18 },
  { header: 'City', key: 'city', width: 12 },
  { header: 'St', key: 'state', width: 4 },
  { header: '⭐#Rev', key: 'open_count', width: 6 },
  { header: '🔥 OPENER (read verbatim) 🔥', key: 'opener', width: 95 },
  { header: '📝 NOTES (fill in after call)', key: 'notes_col', width: 40 },
  { header: '🔁 DAY-2 CALLBACK SCRIPT', key: 'day2', width: 80 },
  { header: '📲 SMS REPORT URL (copy → paste in iMessage)', key: 'send_report_link', width: 90 },
  { header: 'Outcome', key: 'outcome', width: 12 },
]

ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0AA89F' } }
ws.getRow(1).height = 36
ws.getRow(1).alignment = { vertical: 'middle', wrapText: true }

let idx = 1
for (const l of leads) {
  const opener = buildOpener(l)
  const day2 = buildDay2(l)
  // Build the public sample-report URL Peter copy-pastes into iMessage
  // (raw, no hyperlink wrapper, so tap → highlight → copy works on iPhone)
  const reportQs = new URLSearchParams({
    for: l.business_name || '',
    ...(l.city && { city: l.city }),
    ...(l.trade && { type: l.trade }),
  })
  const reportUrl = `${APP}/sample-report?${reportQs.toString()}`

  const row = ws.addRow({
    idx,
    business_name: l.business_name,
    phone_link: l.owner_phone,
    city: l.city,
    state: l.state,
    open_count: l.open_count ?? '',
    opener,
    notes_col: '',
    day2,
    send_report_link: reportUrl,
    outcome: '',
  })

  // Style phone as tel: link
  const phoneCell = row.getCell('phone_link')
  phoneCell.value = { text: l.owner_phone, hyperlink: `tel:${l.owner_phone}` }
  phoneCell.font = { color: { argb: 'FF0066CC' }, underline: true, bold: true, size: 12 }

  // Wrap opener + day2 + notes
  row.getCell('opener').alignment = { vertical: 'top', wrapText: true }
  row.getCell('opener').font = { size: 10 }
  row.getCell('day2').alignment = { vertical: 'top', wrapText: true }
  row.getCell('day2').font = { size: 9, color: { argb: 'FF005F4A' } }
  row.getCell('notes_col').alignment = { vertical: 'top', wrapText: true }
  row.getCell('notes_col').font = { size: 10, color: { argb: 'FF7A4A00' } }

  // SMS report URL — raw text, no hyperlink wrapper so iPhone tap-and-hold copy works
  row.getCell('send_report_link').alignment = { vertical: 'middle', wrapText: true }
  row.getCell('send_report_link').font = { size: 9, color: { argb: 'FFE8742B' } }

  // Row height for wrapped text
  row.height = 90

  // Alternating row background
  if (idx % 2 === 0) {
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5FDFB' } }
  }

  idx++
}

// Add instructions sheet
const inst = wb.addWorksheet('READ FIRST', {})
inst.columns = [{ header: 'BellAveGo Path-Y Cold-Call Playbook', key: 'l', width: 100 }]
inst.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
inst.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } }

const lines = [
  '',
  'GOAL of every cold call: get permission to SMS the report. THAT IS THE WIN.',
  'Do NOT pitch AI receptionist on call #1. Do NOT mention $147. Do NOT explain Emma.',
  '',
  'TURN ORDER:',
  '  1. Read the 🔥 OPENER verbatim',
  '  2. If objection → use ⚠️ OBJECTION RESPONSES',
  '  3. If yes → tap 📲 SMS REPORT (one tap fires Twilio)',
  '  4. Log outcome (RPT / VM / RNA / NI / DEAD)',
  '  5. NEXT ROW',
  '',
  'CALL BACK Day-2: use 🔁 DAY-2 CALLBACK SCRIPT for anyone who got the report yesterday',
  '',
  'TARGETS:',
  '  150 dials/day Mon-Sat',
  '  25% should accept the report SMS',
  '  Day-2 callback = where the sale happens',
  '',
  'OUTCOME CODES:',
  '  RPT  → report sent (best outcome on call #1)',
  '  VM   → left voicemail',
  '  RNA  → rang no answer',
  '  NI   → not interested / DNC (never call again)',
  '  DEAD → wrong number / disconnected',
  '  DEMO → booked demo',
  '',
  'ENERGY:',
  '  8-11am best reach window',
  '  11-2pm lunch dead — do report-SMS follow-ups',
  '  2-5pm 2nd best window',
  '  5-7pm voicemail only',
  '  Stand up. Headphones. Hydrate. 50 dials = 10 min walk.',
  '',
  'THE ONE RULE: get permission to send the report. That is the only thing that matters.',
]
for (const line of lines) inst.addRow({ l: line })

const OUT = `C:\\Users\\peter\\ringoco\\leads\\dial-list-with-script-${today}-v3.xlsx`
await wb.xlsx.writeFile(OUT)

// Mirror to OneDrive
try {
  fs.copyFileSync(OUT, `C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads\\dial-list-with-script-${today}-v3.xlsx`)
  // Also drop in Downloads since that's where Peter has been editing
  fs.copyFileSync(OUT, `C:\\Users\\peter\\Downloads\\dial-list-with-script-${today}-v3.xlsx`)
} catch (e) {
  console.warn('OneDrive mirror failed: ' + e.message)
}

console.log(`✅ Wrote ${leads.length} leads with pre-rendered Path-Y scripts`)
console.log(`   File: ${OUT}`)
console.log(`   OneDrive: C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads\\dial-list-with-script-${today}.xlsx`)
