#!/usr/bin/env node
/**
 * sweep-all-csvs-to-db.mjs — import every with-emails CSV row in /leads
 * into outreach_leads so the Vercel cron has weeks of pipeline ready.
 *
 * UNIQUE constraint on outreach_leads.email auto-dedups.
 *
 * USAGE
 *   node scripts/sweep-all-csvs-to-db.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
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

const PLACEHOLDER = ['example.com', 'example.org', 'domain.com', 'yourcompany.com',
  'your@', 'youremail@', 'name@', 'email@', 'test@', 'demo@', 'sample@',
  'noreply@', 'no-reply@', 'donotreply', 'bobsrepair.com', 'impallari@']
const isPlaceholder = (e) => {
  if (!e || !e.includes('@')) return true
  const low = e.toLowerCase()
  if (PLACEHOLDER.some((p) => low.includes(p))) return true
  const local = low.split('@')[0]
  if (/^\d+$/.test(local)) return true
  if (local.length > 30) return true
  return false
}

const csvs = fs.readdirSync(ROOT).filter((f) =>
  f.endsWith('.csv') &&
  /with-emails|local-emails/.test(f) &&
  !/instantly|batch|push-50/.test(f),
)

console.log(`📂 Sweeping ${csvs.length} CSVs into outreach_leads...\n`)

let totalAttempted = 0
let totalNew = 0
let totalDup = 0
const seen = new Set()

for (const f of csvs) {
  const rows = parse(fs.readFileSync(path.join(ROOT, f), 'utf8'), { columns: true, skip_empty_lines: true, trim: true })
  const candidates = rows
    .map((r) => ({
      email: (r.email || r.owner_email || '').toLowerCase().trim(),
      business_name: r.business_name || r.title || r.name || r.company_name || '',
      owner_first_name: r.owner_first_name || r.owner_first_name_guess || '',
      city: r.city || '',
      state: r.state || '',
      trade: r.business_type || r.trade || r.categories || 'HVAC',
    }))
    .filter((r) => r.email && r.business_name && !isPlaceholder(r.email))
    .filter((r) => {
      if (seen.has(r.email)) return false
      seen.add(r.email)
      return true
    })

  if (candidates.length === 0) continue
  totalAttempted += candidates.length

  // Batch insert 100 at a time with ignoreDuplicates (UNIQUE email constraint)
  for (let i = 0; i < candidates.length; i += 100) {
    const batch = candidates.slice(i, i + 100)
    const { data, error } = await supabase
      .from('outreach_leads')
      .upsert(
        batch.map((c) => ({
          email: c.email,
          business_name: c.business_name,
          owner_first_name: c.owner_first_name || null,
          city: c.city || null,
          state: c.state || null,
          trade: c.trade,
          campaign_id: 'smalldogs-sweep-2026-05-28',
          status: 'queued',
        })),
        { onConflict: 'email', ignoreDuplicates: true },
      )
      .select('id')
    if (error) {
      console.warn(`   ${f}: batch ${i + 1}-${i + batch.length} failed — ${error.message}`)
      continue
    }
    totalNew += data?.length ?? 0
    totalDup += batch.length - (data?.length ?? 0)
  }
  console.log(`  ${f.padEnd(60)} ${candidates.length} candidates`)
}

console.log(`\n════════════════════════════════════════════════════════════════`)
console.log(`Total candidates processed:  ${totalAttempted}`)
console.log(`New rows inserted:           ${totalNew}`)
console.log(`Already in DB (dedup):       ${totalDup}`)
console.log(`════════════════════════════════════════════════════════════════\n`)

const { data: queued } = await supabase
  .from('outreach_leads')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'queued')
console.log(`📤 outreach_leads.queued total: weeks of pipeline ready for cron`)
