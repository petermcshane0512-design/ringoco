#!/usr/bin/env node
/**
 * export-outreach-sheet.mjs — single Excel-friendly CSV of every prospect
 * we've touched, with phone + email + reviews + status + report link.
 *
 * Joins:
 *   leads/arizona-hvac-top-100.csv         (phone, address, original tier)
 *   leads/arizona-hvac-top-100-with-emails.csv  (real email from scrape)
 *   leads/today-send.csv + tonight-second-batch.csv  (subject + report URL + send data)
 *   outreach_leads table                   (status, campaign, last update)
 *   sample_reports table                   (open_count, last_opened_at)
 *
 * OUTPUT
 *   leads/outreach-master.csv — open in Excel; one row per business with all
 *   the data you'd need to pick up the phone fast.
 *
 * USAGE
 *   node scripts/export-outreach-sheet.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
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
const readCSV = (p) =>
  fs.existsSync(p) ? parse(fs.readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true, trim: true }) : []

// 1. Base scrape with phone + address
const baseRows = readCSV(path.join(ROOT, 'arizona-hvac-top-100.csv'))
// 2. Email-enriched version
const emailRows = readCSV(path.join(ROOT, 'arizona-hvac-top-100-with-emails.csv'))
// 3. Today's sent batches
const today = readCSV(path.join(ROOT, 'today-send.csv'))
const tonight = readCSV(path.join(ROOT, 'tonight-second-batch.csv'))

console.log(`📂 base=${baseRows.length} email=${emailRows.length} sent_b1=${today.length} sent_b2=${tonight.length}`)

// Index helpers
const byName = (rows) => {
  const m = new Map()
  for (const r of rows) {
    const key = (r.business_name || r.company_name || r.title || '').toLowerCase().trim()
    if (key) m.set(key, r)
  }
  return m
}
const byEmail = (rows) => {
  const m = new Map()
  for (const r of rows) {
    const e = (r.email || '').toLowerCase().trim()
    if (e) m.set(e, r)
  }
  return m
}

const baseByName = byName(baseRows)
const emailByName = byName(emailRows)
const sentB1ByEmail = byEmail(today)
const sentB2ByEmail = byEmail(tonight)

// Pull every status from outreach_leads (latest snapshot)
const { data: dbLeads } = await supabase
  .from('outreach_leads')
  .select('email, business_name, owner_first_name, status, campaign_id, pushed_at, updated_at')
const dbByEmail = byEmail(dbLeads ?? [])

// Pull click data from sample_reports
const { data: reports } = await supabase
  .from('sample_reports')
  .select('business_name, zip, lead_email, open_count, last_opened_at, generated_at, token')
const reportByEmail = byEmail((reports ?? []).filter((r) => r.lead_email))
const reportByName = new Map((reports ?? []).map((r) => [r.business_name.toLowerCase(), r]))

// Build master rows — union of every source
const allBusinesses = new Set([
  ...emailRows.map((r) => (r.business_name || '').toLowerCase().trim()),
  ...baseRows.map((r) => (r.business_name || '').toLowerCase().trim()),
])

const out = []
for (const nameKey of allBusinesses) {
  if (!nameKey) continue
  const base = baseByName.get(nameKey)
  const enriched = emailByName.get(nameKey)
  const businessName = base?.business_name || enriched?.business_name || nameKey
  const email = (enriched?.email || '').toLowerCase().trim()
  const dbRow = email ? dbByEmail.get(email) : null
  const sentB1 = email ? sentB1ByEmail.get(email) : null
  const sentB2 = email ? sentB2ByEmail.get(email) : null
  const reportRow = (email && reportByEmail.get(email)) || reportByName.get(nameKey)

  // Determine status
  let sentBatch = ''
  let sentAt = ''
  let subject = ''
  let reportUrl = ''
  if (sentB1) {
    sentBatch = 'batch1 (2pm)'
    subject = sentB1.subject_line
    reportUrl = sentB1.report_url
  } else if (sentB2) {
    sentBatch = 'batch2 (4pm)'
    subject = sentB2.subject_line
    reportUrl = sentB2.report_url
  }
  if (dbRow?.pushed_at) sentAt = dbRow.pushed_at

  const dbStatus = dbRow?.status || (email && (sentB1 || sentB2) ? 'sent' : 'not_sent')
  const opens = reportRow?.open_count ?? 0
  const lastOpened = reportRow?.last_opened_at ?? ''

  out.push({
    business_name: businessName,
    phone: base?.phone ?? enriched?.phone ?? '',
    city: base?.city ?? enriched?.city ?? '',
    state: base?.state ?? enriched?.state ?? 'Arizona',
    address: base?.address ?? '',
    website: base?.website ?? enriched?.website ?? '',
    email: email,
    rating: base?.rating ?? enriched?.rating ?? '',
    reviews: base?.reviews ?? enriched?.reviews ?? '',
    tier: base?.tier ?? enriched?.tier ?? '',
    recommended_plan: base?.recommended_plan ?? '',
    pitch_hook: (base?.pitch_hook ?? '').slice(0, 200),
    sent_batch: sentBatch,
    sent_at: sentAt,
    status: dbStatus,
    subject_line: subject,
    report_opens: opens,
    last_opened: lastOpened,
    report_url: reportUrl,
    google_place_id: base?.google_place_id ?? '',
  })
}

// Sort: sent first, then by reviews desc
out.sort((a, b) => {
  if (a.sent_batch && !b.sent_batch) return -1
  if (!a.sent_batch && b.sent_batch) return 1
  return Number(b.reviews || 0) - Number(a.reviews || 0)
})

const cols = [
  'business_name', 'phone', 'city', 'state', 'address', 'website', 'email',
  'rating', 'reviews', 'tier', 'recommended_plan', 'pitch_hook',
  'sent_batch', 'sent_at', 'status', 'subject_line', 'report_opens', 'last_opened',
  'report_url', 'google_place_id',
]

const outPath = path.join(ROOT, 'outreach-master.csv')
fs.writeFileSync(outPath, stringify(out, { header: true, columns: cols }))

const sent = out.filter((r) => r.sent_batch).length
const opened = out.filter((r) => Number(r.report_opens) > 0).length
console.log(`\n✅ Wrote ${out.length} rows to ${outPath}`)
console.log(`   Sent today:    ${sent}`)
console.log(`   Opened report: ${opened}`)
console.log(`   Have phone:    ${out.filter((r) => r.phone).length}`)
console.log(`   Have email:    ${out.filter((r) => r.email).length}`)
console.log(`\nOpen in Excel: powershell -c "Invoke-Item ${outPath}"`)
