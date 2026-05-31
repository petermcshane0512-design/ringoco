#!/usr/bin/env node
/**
 * call-list-today.mjs — yesterday-cohort callable list.
 *
 * Pulls every outreach_lead where status='sent' AND updated_at < (now - 12h).
 * Joins each with phone numbers found in any scrape CSV. Groups by city,
 * marks ones already called. The right call list for today at 11 AM ET.
 *
 * USAGE
 *   node scripts/call-list-today.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
const { data } = await supabase
  .from('outreach_leads')
  .select('email, business_name, city, updated_at, call_attempted_at, call_outcome')
  .eq('status', 'sent')
  .lt('updated_at', cutoff)
  .order('city', { ascending: true })

console.log(`📞 ${data.length} ripe leads (sent >12h ago, no inbox-blocking)`)

const phoneByEmail = new Map()
const root = 'C:\\Users\\peter\\ringoco\\leads'
for (const f of fs.readdirSync(root)) {
  if (!f.endsWith('.csv') || /instantly|batch|push-50/.test(f)) continue
  try {
    const rows = parse(fs.readFileSync(path.join(root, f), 'utf8'), { columns: true, skip_empty_lines: true, trim: true })
    for (const r of rows) {
      const e = (r.email || r.owner_email || '').toLowerCase().trim()
      const p = (r.phone || r.phoneUnformatted || '').trim()
      if (e && p && !phoneByEmail.has(e)) phoneByEmail.set(e, p)
    }
  } catch {}
}

const byCity = new Map()
for (const r of data) {
  const city = r.city || 'Unknown'
  if (!byCity.has(city)) byCity.set(city, [])
  byCity.get(city).push({ ...r, phone: phoneByEmail.get((r.email || '').toLowerCase()) || '' })
}

console.log('')
for (const [city, rows] of [...byCity.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`━━━ ${city} (${rows.length}) ━━━`)
  let n = 1
  for (const r of rows) {
    const mark = r.call_attempted_at ? ` ✓ ${r.call_outcome || 'called'}` : ''
    console.log(`  ${n}. ${r.business_name}${mark}`)
    if (r.phone) console.log(`      📞 ${r.phone}`)
    else console.log(`      (no phone in CSVs)`)
    console.log(`      ✉  ${r.email}`)
    n++
  }
  console.log('')
}
