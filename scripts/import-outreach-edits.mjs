#!/usr/bin/env node
/**
 * import-outreach-edits.mjs — read Peter's manual edits from outreach-master.xlsx
 * and push them back into outreach_leads.
 *
 * Two-way sync workflow:
 *   1. Morning: run export-outreach-xlsx.mjs → fresh Excel built from DB
 *   2. During day: Peter edits the Excel (logs calls, texts, demo notes)
 *   3. Night: run import-outreach-edits.mjs → writes Peter's edits back to DB
 *   4. Next morning: stats script learns from the new touchpoints
 *
 * Only updates these user-editable columns (auto-refresh columns are ignored):
 *   call_attempted_at, call_outcome, call_notes,
 *   text_opt_in_at, text_sent_at, text_response_at, text_response,
 *   demo_booked_at, demo_outcome,
 *   trial_started_at, paid_at, plan_tier_signed, notes
 *
 * USAGE
 *   node scripts/import-outreach-edits.mjs
 */

import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const XLSX_PATH = 'C:\\Users\\peter\\ringoco\\leads\\outreach-master.xlsx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(XLSX_PATH)
const ws = wb.getWorksheet('Arizona HVAC Prospects') ?? wb.worksheets[0]

// Find header row (row 3 in our export)
const headerRow = ws.getRow(3)
const headers = {}
headerRow.eachCell((cell, col) => { headers[String(cell.value).trim()] = col })

const EDITABLE = [
  'call_attempted_at', 'call_outcome', 'call_notes',
  'text_opt_in_at', 'text_sent_at', 'text_response_at', 'text_response',
  'demo_booked_at', 'demo_outcome',
  'trial_started_at', 'paid_at', 'plan_tier_signed', 'notes',
]

// Map header names (display labels) to DB column names
const labelToCol = {
  'Call At': 'call_attempted_at',
  'Call Outcome': 'call_outcome',
  'Call Notes': 'call_notes',
  'Text Opt-In': 'text_opt_in_at',
  'Text Sent': 'text_sent_at',
  'Text Response At': 'text_response_at',
  'Text Response': 'text_response',
  'Demo Booked': 'demo_booked_at',
  'Demo Outcome': 'demo_outcome',
  'Trial Started': 'trial_started_at',
  'Paid': 'paid_at',
  'Plan Signed': 'plan_tier_signed',
  'Notes': 'notes',
}

const emailCol = headers['Email']
if (!emailCol) {
  console.error('FATAL: could not find Email column in Excel header')
  process.exit(1)
}

let updated = 0
let skipped = 0

for (let rowNum = 4; rowNum <= ws.rowCount; rowNum++) {
  const row = ws.getRow(rowNum)
  const email = String(row.getCell(emailCol).value || '').toLowerCase().trim()
  if (!email || !email.includes('@')) { skipped++; continue }

  const patch = {}
  for (const [label, dbCol] of Object.entries(labelToCol)) {
    const c = headers[label]
    if (!c) continue
    const raw = row.getCell(c).value
    if (raw == null || raw === '') continue
    // Convert dates to ISO
    if (dbCol.endsWith('_at')) {
      const d = raw instanceof Date ? raw : new Date(String(raw))
      if (!isNaN(d.getTime())) patch[dbCol] = d.toISOString()
    } else {
      patch[dbCol] = String(raw).trim()
    }
  }

  if (Object.keys(patch).length === 0) continue
  patch.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('outreach_leads')
    .update(patch)
    .ilike('email', email)
  if (error) {
    console.warn(`  ⚠ ${email}: ${error.message}`)
    continue
  }
  updated++
  console.log(`  ✅ ${email}: ${Object.keys(patch).filter(k => k !== 'updated_at').join(', ')}`)
}

console.log(`\nUpdated ${updated} rows · Skipped ${skipped} (no email)`)
console.log(`Run \`node scripts/outreach-stats.mjs\` to see updated funnel.`)
