#!/usr/bin/env node
/**
 * export-simple.mjs — STRIPPED-DOWN cold-outreach Excel.
 *
 * Per Peter 5/28: master sheet was too cluttered. Want only the columns
 * needed to dial + track + log a single call.
 *
 * Columns (left → right):
 *   1. Customer Name
 *   2. Email
 *   3. Phone
 *   4. City
 *   5. Sent When
 *   6. Called?
 *   7. Call Summary
 *   8. Notes
 *
 * Sort tiers (top → bottom):
 *   🔵 Light blue   = Unsent (queue tomorrow)
 *   🟢 Light green  = Sent today to small dog (just landed)
 *   🟩 Dark green   = Sent 24h+ to small dog (CALL NOW)
 *   🟡 Pale yellow  = Big boy (150+ reviews, SKIP)
 *
 * One city tab per market with same columns + colors.
 *
 * USAGE
 *   node scripts/export-simple.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const ROOT = 'C:\\Users\\peter\\ringoco\\leads'
const norm = (s) => (s || '').toLowerCase().trim()

const PLACEHOLDER = ['example.com', 'example.org', 'domain.com', 'yourcompany.com',
  'your@', 'youremail@', 'name@', 'email@', 'test@', 'demo@', 'sample@',
  'noreply@', 'no-reply@', 'donotreply', 'bobsrepair.com', 'impallari@']
const isValidEmail = (e) => {
  if (!e || typeof e !== 'string') return false
  if (!/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(e)) return false
  const low = e.toLowerCase()
  if (PLACEHOLDER.some((p) => low.includes(p))) return false
  const local = low.split('@')[0]
  if (/^\d+$/.test(local) || local.length > 30) return false
  return true
}

// Pull canonical lead data from outreach_leads + cached reports — DB is the
// source of truth for sent/called/notes/status. CSVs only contribute phone +
// address fallback for rows not yet ingested.
const { data: dbLeads } = await supabase
  .from('outreach_leads')
  .select(`
    email, business_name, city, state, owner_first_name,
    status, pushed_at, updated_at,
    call_attempted_at, call_outcome, call_notes,
    text_response, demo_outcome, trial_started_at, paid_at, notes
  `)

// Build a map for fast lookup
const dbByEmail = new Map()
for (const r of dbLeads ?? []) {
  const e = norm(r.email)
  if (e) dbByEmail.set(e, r)
}

// Pull review counts from sample_reports for tier classification
const { data: reports } = await supabase
  .from('sample_reports')
  .select('business_name, lead_email, report')
const reviewsByName = new Map()
for (const r of reports ?? []) {
  const reviews = r.report?.competitive?.yourReviewCount
  if (reviews != null) reviewsByName.set(norm(r.business_name), reviews)
}

// Sweep CSVs for phone fallback + leads not yet in outreach_leads
const csvs = fs.readdirSync(ROOT).filter((f) =>
  f.endsWith('.csv') &&
  /with-emails|local-emails/.test(f) &&
  !/instantly|batch|push-50/.test(f),
)

const seenEmails = new Set()
const rows = []

for (const f of csvs) {
  const csvRows = parse(fs.readFileSync(path.join(ROOT, f), 'utf8'), { columns: true, skip_empty_lines: true, trim: true })
  for (const r of csvRows) {
    const email = norm(r.email || r.owner_email)
    if (!isValidEmail(email)) continue
    if (seenEmails.has(email)) continue
    seenEmails.add(email)

    const db = dbByEmail.get(email)
    const name = r.business_name || r.title || r.name || db?.business_name || ''
    if (!name) continue

    // Parse city from address as fallback
    let city = r.city || db?.city || ''
    if (!city && r.address) {
      const m = r.address.match(/,\s*([A-Za-z][A-Za-z\s.'-]+),\s*[A-Z]{2}\s+\d{5}/)
      if (m) city = m[1].trim()
    }

    const reviews = reviewsByName.get(norm(name)) ?? Number(r.reviews ?? 0)
    // Only treat as "sent" if outreach_leads.status actually says so.
    // pushed_at is the INSERT timestamp from scrape — not the send moment.
    const wasSent = db?.status === 'sent' || db?.status === 'positive_reply'
      || db?.status === 'objection' || db?.status === 'wrong_person'
      || db?.status === 'reply_other'
    const sentAt = wasSent ? (db?.updated_at || null) : null
    const sent = sentAt ? new Date(sentAt) : null

    let sentWhen = ''
    if (sent) {
      const now = new Date()
      const sentDay = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate())
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const days = Math.floor((today - sentDay) / (24 * 60 * 60 * 1000))
      const time = sent.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      sentWhen = days === 0 ? `TODAY ${time}`
        : days === 1 ? `YESTERDAY ${time}`
        : days < 7 ? `${days} days ago`
        : sent.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    }

    // Tier: 1 unsent, 2 sent <24h small dog, 3 sent 24h+ small dog, 4 big boy
    const isBigBoy = reviews >= 150
    let tier
    if (!sent) tier = 1
    else if (isBigBoy) tier = 4
    else {
      const hrs = (Date.now() - sent.getTime()) / (60 * 60 * 1000)
      tier = hrs < 24 ? 2 : 3
    }

    const calledAt = db?.call_attempted_at
    const calledWhen = calledAt
      ? new Date(calledAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
      : ''
    const callStatus = calledAt ? (db?.call_outcome || 'Called') : 'Not Yet'

    rows.push({
      customer_name: name,
      email,
      phone: r.phone || db?.owner_phone || r.phoneUnformatted || '',
      city: city || '',
      sent_when: sentWhen,
      called: callStatus,
      call_summary: db?.call_notes || '',
      notes: db?.notes || '',
      _tier: tier,
      _reviews: reviews,
      _sent_at: sent?.getTime() ?? 0,
    })
  }
}

// Sort: tier ASC, then sent newest first within tier
rows.sort((a, b) => {
  if (a._tier !== b._tier) return a._tier - b._tier
  if (a._sent_at && b._sent_at) return b._sent_at - a._sent_at
  return 0
})

console.log(`📋 ${rows.length} valid-email leads after dedup`)

// ── Build workbook ────────────────────────────────────────────
const wb = new ExcelJS.Workbook()
wb.creator = 'BellAveGo · Jarvis'
wb.created = new Date()

const TIER_FILL = {
  1: 'FFBFDBFE', // light blue
  2: 'FFBBF7D0', // light green
  3: 'FF15803D', // dark green
  4: 'FFFFF59D', // pale yellow
}
const TIER_FONT = {
  1: 'FF0B1F3A', 2: 'FF0B1F3A', 3: 'FFFFFFFF', 4: 'FF0B1F3A',
}

const COLUMNS = [
  { header: 'Customer Name', key: 'customer_name', width: 36 },
  { header: 'Email', key: 'email', width: 32 },
  { header: 'Phone', key: 'phone', width: 16 },
  { header: 'City', key: 'city', width: 18 },
  { header: 'Sent When', key: 'sent_when', width: 18 },
  { header: 'Called?', key: 'called', width: 14 },
  { header: 'Call Summary', key: 'call_summary', width: 50 },
  { header: 'Notes', key: 'notes', width: 40 },
]

function buildSheet(name, sheetRows) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
  ws.columns = COLUMNS.map((c) => ({ ...c }))
  // Header
  ws.getRow(1).values = COLUMNS.map((c) => c.header)
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF334155' } } }
  })
  ws.getRow(1).height = 30
  // Data
  for (const r of sheetRows) {
    const excelRow = ws.addRow(r)
    const fill = TIER_FILL[r._tier]
    const fontColor = TIER_FONT[r._tier]
    excelRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      cell.font = { size: 11, color: { argb: fontColor }, bold: r._tier === 3 }
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
    })
    // Clickable phone + email
    if (r.phone) {
      const c = excelRow.getCell(3)
      c.value = { text: r.phone, hyperlink: `tel:${String(r.phone).replace(/[^\d+]/g, '')}` }
      c.font = { size: 11, color: { argb: 'FF2563EB' }, underline: true, bold: true }
    }
    if (r.email) {
      const c = excelRow.getCell(2)
      c.value = { text: r.email, hyperlink: `mailto:${r.email}` }
      c.font = { size: 11, color: { argb: 'FF2563EB' }, underline: true }
    }
  }
  // Data validation on Called? column (col 6): dropdown
  if (sheetRows.length > 0) {
    for (let i = 2; i <= sheetRows.length + 1; i++) {
      ws.getCell(`F${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Not Yet,Called,Voicemail,No Answer,Interested,Not Interested,Wrong Number,Hostile"'],
      }
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheetRows.length + 1, column: COLUMNS.length } }
}

// Master tab
buildSheet('Master - All Cities', rows)

// Per-city tabs (≥3 rows)
const byCity = new Map()
for (const r of rows) {
  const k = (r.city || 'Unknown').trim()
  if (!byCity.has(k)) byCity.set(k, [])
  byCity.get(k).push(r)
}
const cityNames = [...byCity.keys()].filter((c) => c !== 'Unknown' && byCity.get(c).length >= 3)
cityNames.sort((a, b) => byCity.get(b).length - byCity.get(a).length)
for (const city of cityNames) buildSheet(city, byCity.get(city))

const outPath = path.join(ROOT, 'outreach-master.xlsx')
await wb.xlsx.writeFile(outPath)

// Summary
const byTier = [1, 2, 3, 4].map((t) => rows.filter((r) => r._tier === t).length)
console.log(`\n✅ ${outPath}`)
console.log(`   🔵 Unsent (queue):           ${byTier[0]}`)
console.log(`   🟢 Sent <24h to small dog:   ${byTier[1]}`)
console.log(`   🟩 Sent 24h+ to small dog:   ${byTier[2]} ← CALL THESE`)
console.log(`   🟡 Big boys (skip):          ${byTier[3]}`)
console.log(`   📑 City tabs:                ${cityNames.length} (${cityNames.slice(0, 6).join(', ')}${cityNames.length > 6 ? '…' : ''})`)
console.log(`\nOpen with: Invoke-Item ${outPath}`)
