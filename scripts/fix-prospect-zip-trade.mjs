#!/usr/bin/env node
/**
 * 2026-06-11 launch-day repair. The auto-load-instantly cron created
 * prospect_free_leads rows (biz_id inst_*) with zip="" + trade="other"
 * for all 369 campaign contacts. The free-lead page can't pull a real
 * homeowner without a zip, and "other" is the wrong recipe. The CSV
 * (data/outreach-450.csv) carries the correct zip + trade per email.
 *
 * This matches CSV → existing prospect_free_leads BY EMAIL and updates
 * zip + trade + city + state. Keeps the existing inst_* biz_id (the
 * /free-lead?b= URLs + Instantly backfill key off whatever biz_id is on
 * the row, so no need to churn it). No BatchData spend — generation
 * still happens on the free-lead button click.
 *
 *   node scripts/fix-prospect-zip-trade.mjs            # dry-run
 *   node scripts/fix-prospect-zip-trade.mjs --commit
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const COMMIT = process.argv.includes('--commit')

function normTrade(raw) {
  const t = (raw || '').toLowerCase()
  if (t.includes('plumb')) return 'plumbing'
  if (t.includes('elect')) return 'electrical'
  if (t.includes('roof')) return 'roofing'
  if (t.includes('handy') || t.includes('general')) return 'handyman'
  if (t.includes('hvac') || t.includes('air') || t.includes('heat') || t.includes('cool')) return 'hvac'
  return 'hvac'
}

const lines = fs.readFileSync('data/outreach-450.csv', 'utf8').split(/\r?\n/).filter((l) => l.trim())
const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
const rows = lines.slice(1).map((line) => {
  const cells = []; let cur = '', q = false
  for (const c of line) { if (c === '"') { q = !q; continue } if (c === ',' && !q) { cells.push(cur); cur = ''; continue } cur += c }
  cells.push(cur)
  const r = {}; headers.forEach((h, i) => { r[h] = (cells[i] || '').trim() }); return r
})

let matched = 0, updated = 0, noRow = 0, noZip = 0
for (const r of rows) {
  const email = (r.email || '').toLowerCase()
  const zip = (r.zip || '').replace(/\D/g, '').slice(0, 5)
  const trade = normTrade(r.trade)
  if (!zip) { noZip++; continue }
  const { data: existing } = await sb.from('prospect_free_leads').select('biz_id,zip,trade').eq('email', email).maybeSingle()
  if (!existing) { noRow++; continue }
  matched++
  if (existing.zip === zip && existing.trade === trade) continue
  if (COMMIT) {
    const { error } = await sb.from('prospect_free_leads')
      .update({ zip, trade, city: r.city || null, state: r.state || null })
      .eq('email', email)
    if (!error) updated++
    else console.error('  upd err', email, error.message)
  } else {
    updated++
  }
}
console.log(`rows: ${rows.length} | matched existing: ${matched} | ${COMMIT ? 'updated' : 'would update'}: ${updated} | no prospect row: ${noRow} | no zip in csv: ${noZip}`)
if (!COMMIT) console.log('*** DRY-RUN — add --commit to write ***')
