/**
 * Seed prospect_free_leads w/ row stubs from data/outreach-{batch}.csv.
 *
 * Per Fable 5 review:
 *   1. Dedupe + normalize (lowercase email, trim, 5-digit zip)
 *   2. Map trades to 6 canonical (hvac, plumbing, electrical, roofing, handyman, other)
 *      anything weird → trade='other' + raw value in other_trade column
 *   3. DRY-RUN by default. Requires explicit --commit to write.
 *   4. source_batch column for per-campaign conversion attribution.
 *
 * No BatchData spend — just biz_id/email/zip/city/state/trade. Generation
 * happens lazily on human button click via /api/free-lead/generate.
 *
 * Usage:
 *   npx tsx scripts/seed-prospect-rows.ts                       # dry-run, default csv + batch
 *   npx tsx scripts/seed-prospect-rows.ts data/outreach-450.csv
 *   npx tsx scripts/seed-prospect-rows.ts data/outreach-450.csv --batch phoenix-480-june --commit
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const CANONICAL_TRADES = new Set(['hvac', 'plumbing', 'electrical', 'roofing', 'handyman', 'other'])

function canonicalizeTrade(raw: string): { trade: string; other_trade: string | null } {
  const t = (raw || '').toLowerCase().trim()
  if (!t) return { trade: 'other', other_trade: null }
  if (t.includes('plumb')) return { trade: 'plumbing', other_trade: null }
  if (t.includes('elect')) return { trade: 'electrical', other_trade: null }
  if (t.includes('roof')) return { trade: 'roofing', other_trade: null }
  if (t.includes('handy') || t.includes('general')) return { trade: 'handyman', other_trade: null }
  if (t.includes('hvac') || t.includes('heating') || t.includes('air condition') || t.includes('cooling') || t.includes('furnace') || t.includes('heat pump') || t.includes('a/c') || /\bac\b/.test(t)) return { trade: 'hvac', other_trade: null }
  // Unknown — preserve raw in other_trade for later inspection
  return { trade: 'other', other_trade: raw.slice(0, 64) }
}

function normalizeEmail(raw: string): string | null {
  const e = (raw || '').toLowerCase().trim()
  if (!e || !e.includes('@')) return null
  return e
}

function normalizeZip(raw: string): string {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length >= 5) return d.slice(0, 5)
  return ''
}

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const rows: Array<Record<string, string>> = []
  for (const line of lines.slice(1)) {
    const cells: string[] = []
    let cur = ''
    let inQ = false
    for (const c of line) {
      if (c === '"') { inQ = !inQ; continue }
      if (c === ',' && !inQ) { cells.push(cur); cur = ''; continue }
      cur += c
    }
    cells.push(cur)
    const r: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) r[headers[i]] = (cells[i] || '').trim()
    rows.push(r)
  }
  return rows
}

async function main() {
  const args = process.argv.slice(2)
  const csvPath = args.find((a) => !a.startsWith('--')) || resolve(process.cwd(), 'data/outreach-450.csv')
  const commit = args.includes('--commit')
  const batchArg = args.find((a) => a.startsWith('--batch'))
  const sourceBatch = (batchArg ? batchArg.split('=')[1] || args[args.indexOf(batchArg) + 1] : 'phoenix-480-june') as string

  console.log(`\n=== Seed prospect_free_leads ===`)
  console.log(`  csv:          ${csvPath}`)
  console.log(`  source_batch: ${sourceBatch}`)
  console.log(`  mode:         ${commit ? 'COMMIT' : 'DRY-RUN'}`)
  console.log('')

  const content = readFileSync(csvPath, 'utf8')
  const rows = parseCsv(content)
  console.log(`Loaded ${rows.length} raw CSV rows.\n`)

  // Normalize + dedupe in one pass
  const seenEmails = new Set<string>()
  const seenBizIds = new Set<string>()
  const records: Array<{
    biz_id: string
    email: string
    trade: string
    other_trade: string | null
    zip: string
    city: string
    state: string
    source_batch: string
  }> = []
  let dropMissingId = 0
  let dropMissingEmail = 0
  let dropDupeEmail = 0
  let dropDupeBizId = 0
  const tradeFlags = new Map<string, number>()  // other_trade flagged

  for (const r of rows) {
    const biz_id = (r.biz_id || r.id || '').trim()
    if (!biz_id) { dropMissingId++; continue }
    if (seenBizIds.has(biz_id)) { dropDupeBizId++; continue }
    seenBizIds.add(biz_id)

    const email = normalizeEmail(r.email)
    if (!email) { dropMissingEmail++; continue }
    if (seenEmails.has(email)) { dropDupeEmail++; continue }
    seenEmails.add(email)

    const { trade, other_trade } = canonicalizeTrade(r.trade || r.category || '')
    if (trade === 'other' && other_trade) {
      tradeFlags.set(other_trade, (tradeFlags.get(other_trade) || 0) + 1)
    }

    records.push({
      biz_id,
      email,
      trade,
      other_trade,
      zip: normalizeZip(r.zip || r.zipcode || ''),
      city: (r.city || '').slice(0, 64),
      state: (r.state || '').slice(0, 32),
      source_batch: sourceBatch,
    })
  }

  // Report
  console.log(`--- Normalization summary ---`)
  console.log(`  to insert:           ${records.length}`)
  console.log(`  dropped: missing id  ${dropMissingId}`)
  console.log(`  dropped: missing email ${dropMissingEmail}`)
  console.log(`  dropped: dupe biz_id ${dropDupeBizId}`)
  console.log(`  dropped: dupe email  ${dropDupeEmail}`)

  console.log(`\n--- Trade distribution ---`)
  const tradeCounts = new Map<string, number>()
  for (const r of records) tradeCounts.set(r.trade, (tradeCounts.get(r.trade) || 0) + 1)
  for (const [t, c] of [...tradeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(15)} ${c}`)
  }

  if (tradeFlags.size > 0) {
    console.log(`\n--- Other-trade flags (kept as trade='other' + other_trade=raw) ---`)
    for (const [t, c] of [...tradeFlags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`  ${t.padEnd(40)} ${c}`)
    }
  }

  // Sample rows
  console.log(`\n--- First 3 sample rows ---`)
  for (const r of records.slice(0, 3)) {
    console.log(`  ${JSON.stringify(r).slice(0, 220)}`)
  }

  if (!commit) {
    console.log(`\n*** DRY-RUN. No writes. Add --commit to actually insert. ***\n`)
    return
  }

  console.log(`\n--- Writing ${records.length} rows ---`)
  let inserted = 0
  let errored = 0
  const CHUNK = 50
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('prospect_free_leads')
      .upsert(chunk, { onConflict: 'biz_id' })
    if (error) {
      console.warn(`  chunk ${i}-${i + chunk.length} err: ${error.message}`)
      errored += chunk.length
    } else {
      inserted += chunk.length
    }
  }
  console.log(`\nDone. ${inserted} upserted, ${errored} errored.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
