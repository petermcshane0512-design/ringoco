#!/usr/bin/env node
/**
 * pull-queue.mjs — claim the next N queued leads from outreach_leads and
 * emit a CSV the cold-email-pipeline can consume.
 *
 * Atomic claim semantics: this script UPDATEs status='personalizing' as soon
 * as it pulls the rows, so a second run on the same minute doesn't double-pull
 * the same leads. If you crash mid-pipeline, you can re-flip them back via
 * the --reclaim-stuck flag (rows still 'personalizing' after 1hr go back to
 * 'queued' automatically).
 *
 * USAGE
 *   node scripts/pull-queue.mjs --limit 15 --output leads/today-batch.csv
 *
 * FLAGS
 *   --limit N           how many leads to pull (default 50)
 *   --output PATH       output CSV path (default leads/queue-pull-{date}.csv)
 *   --campaign id       filter to a specific campaign_id
 *   --trade HVAC        filter trade
 *   --reclaim-stuck     reset 'personalizing' rows older than 1hr to 'queued'
 *   --dry-run           print what would be pulled, don't update status
 *
 * ENV
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs'
import path from 'node:path'
import { stringify } from 'csv-stringify/sync'
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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const args = parseArgs(process.argv.slice(2))
const limit = parseInt(args.limit ?? '50', 10)
const campaignId = args.campaign || null
const tradeFilter = args.trade || null
const dryRun = args['dry-run'] === true || args['dry-run'] === 'true'
const reclaimStuck = args['reclaim-stuck'] === true || args['reclaim-stuck'] === 'true'
const defaultOut = `leads/queue-pull-${new Date().toISOString().slice(0, 10)}.csv`
const outputPath = args.output ?? defaultOut

// ── Optional: reclaim stuck rows ───────────────────────────────
if (reclaimStuck) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: stuck, error: reclaimErr } = await supabase
    .from('outreach_leads')
    .update({ status: 'queued', updated_at: new Date().toISOString() })
    .eq('status', 'personalizing')
    .lt('updated_at', oneHourAgo)
    .select('id')
  if (reclaimErr) {
    console.error('reclaim failed:', reclaimErr.message)
  } else {
    console.log(`♻️  reclaimed ${stuck?.length ?? 0} stuck rows back to queued`)
  }
}

// ── Pull next N queued ─────────────────────────────────────────
let query = supabase
  .from('outreach_leads')
  .select('id, email, business_name, owner_first_name, city, state, trade, campaign_id')
  .eq('status', 'queued')
  .order('pushed_at', { ascending: true })
  .limit(limit)

if (campaignId) query = query.eq('campaign_id', campaignId)
if (tradeFilter) query = query.eq('trade', tradeFilter)

const { data: leads, error } = await query
if (error) {
  console.error('query failed:', error.message)
  process.exit(1)
}

if (!leads || leads.length === 0) {
  console.log('🪫 No queued leads. Run scrape + import to fill the queue.')
  process.exit(0)
}

console.log(`📥 pulled ${leads.length} queued leads (limit=${limit})`)

// ── Atomic claim: flip status before generating reports ────────
if (!dryRun) {
  const ids = leads.map((l) => l.id)
  const { error: claimErr } = await supabase
    .from('outreach_leads')
    .update({ status: 'personalizing', updated_at: new Date().toISOString() })
    .in('id', ids)
  if (claimErr) {
    console.error('claim failed:', claimErr.message)
    process.exit(1)
  }
  console.log(`✅ claimed ${leads.length} leads (status=personalizing)`)
} else {
  console.log('🧪 --dry-run: leaving status=queued')
}

// ── Emit CSV in shape cold-email-pipeline expects ──────────────
const rows = leads.map((l) => ({
  business_name: l.business_name || '',
  zip: '', // not stored in outreach_leads — pipeline tolerates empty (uses city instead)
  city: l.city || '',
  state: l.state || '',
  email: l.email || '',
  first_name: l.owner_first_name || '',
  business_type: l.trade || 'HVAC',
  campaign_id: l.campaign_id || '',
  lead_id: l.id,
}))

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
const csv = stringify(rows, {
  header: true,
  columns: ['business_name', 'zip', 'city', 'state', 'email', 'first_name', 'business_type', 'campaign_id', 'lead_id'],
})
fs.writeFileSync(outputPath, csv)

console.log(`\n📝 wrote ${rows.length} rows to ${outputPath}`)
console.log(`\nNext: node scripts/run-cold-email-pipeline.mjs --csv ${outputPath} --concurrency 5`)

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}
