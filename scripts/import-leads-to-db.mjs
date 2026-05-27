#!/usr/bin/env node
/**
 * import-leads-to-db.mjs — load enriched leads CSV into Supabase outreach_leads.
 *
 * Dedup via UNIQUE constraint on outreach_leads.email — re-running on the same
 * city or a stale CSV just no-ops the duplicates. New shops get inserted with
 * status='queued' so the pull-queue script can grab them later.
 *
 * INPUT
 *   CSV with at minimum: business_name (or title), email, city, state.
 *   Optional pass-through: zip, owner_first_name, phone, website, trade,
 *   review_count, google_rating.
 *
 * USAGE
 *   node scripts/import-leads-to-db.mjs <csv-path> [--trade HVAC] [--campaign hvac-summer-2026]
 *
 * ENV
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: Supabase env missing')
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
const inputPath = args._[0]
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Usage: node scripts/import-leads-to-db.mjs <csv-path> [--trade HVAC] [--campaign id]')
  process.exit(1)
}

const tradeOverride = args.trade
const campaignId = args.campaign || null

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const raw = fs.readFileSync(inputPath, 'utf8')
const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true })
console.log(`📂 ${rows.length} rows from ${inputPath}`)

// Normalize across the various CSV shapes (Apify Maps, enriched, with-emails).
const normalized = rows
  .map((r) => ({
    email: (r.email || r.owner_email || '').toLowerCase().trim(),
    business_name: r.business_name || r.title || r.name || r.company_name || '',
    owner_first_name: r.owner_first_name || r.owner_first_name_guess || r.first_name || '',
    city: r.city || '',
    state: r.state || '',
    zip: String(r.zip || r.zipCode || r.postalCode || '').replace(/\D/g, '').slice(0, 5),
    phone: r.phone || r.phoneUnformatted || '',
    website: r.website || '',
    trade: tradeOverride || r.trade || r.business_type || r.categories || 'HVAC',
    google_rating: parseFloatOrNull(r.google_rating || r.rating || r.totalScore),
    review_count: parseIntOrNull(r.review_count || r.reviews || r.reviewsCount),
    campaign_id: campaignId,
  }))
  .filter((r) => r.email && r.business_name)

console.log(`🧹 ${normalized.length} rows with email + business_name`)

if (normalized.length === 0) {
  console.error('No usable rows. Make sure CSV has an `email` column (or run scrape-emails.mjs first).')
  process.exit(1)
}

// ── Insert with ON CONFLICT DO NOTHING ─────────────────────────
// outreach_leads.email has UNIQUE constraint per migration 001.
// Inserting in batches keeps memory low and lets us count new vs dup.
const batchSize = 100
let inserted = 0
let skipped = 0
let errors = 0

for (let i = 0; i < normalized.length; i += batchSize) {
  const batch = normalized.slice(i, i + batchSize)
  // We want to know which were actually inserted (returning) so we can count
  // new vs dup. PostgREST: upsert with ignoreDuplicates skips conflicts.
  const { data, error } = await supabase
    .from('outreach_leads')
    .upsert(
      batch.map((r) => ({
        email: r.email,
        business_name: r.business_name,
        owner_first_name: r.owner_first_name || null,
        city: r.city || null,
        state: r.state || null,
        trade: r.trade,
        campaign_id: r.campaign_id,
        status: 'queued',
      })),
      { onConflict: 'email', ignoreDuplicates: true },
    )
    .select('id, email')

  if (error) {
    console.error(`  batch ${i}-${i + batch.length} failed:`, error.message)
    errors += batch.length
    continue
  }
  const newInserts = data?.length ?? 0
  inserted += newInserts
  skipped += batch.length - newInserts
  console.log(`  batch ${i + 1}-${i + batch.length}: ${newInserts} new · ${batch.length - newInserts} duplicate`)
}

console.log(`\n════════════════════════════════════════════════════════════════`)
console.log('DONE')
console.log(`════════════════════════════════════════════════════════════════`)
console.log(`Rows processed:   ${normalized.length}`)
console.log(`New inserted:     ${inserted}`)
console.log(`Already in DB:    ${skipped}`)
console.log(`Errors:           ${errors}`)
if (inserted > 0) {
  console.log(`\nNext: node scripts/pull-queue.mjs --limit 15`)
}

// ── Helpers ────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        out[key] = next
        i++
      } else {
        out[key] = true
      }
    } else {
      out._.push(a)
    }
  }
  return out
}

function parseFloatOrNull(v) {
  if (v == null || v === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function parseIntOrNull(v) {
  if (v == null || v === '') return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}
