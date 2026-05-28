#!/usr/bin/env node
/**
 * hot-leads.mjs — show every prospect who opened their consulting report,
 * sorted by most recent open. Call these first.
 *
 * USAGE
 *   node scripts/hot-leads.mjs
 *   node scripts/hot-leads.mjs --since 2026-05-27
 *
 * ENV
 *   DATABASE_URL — Supabase session pooler
 */

import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const args = process.argv.slice(2)
const sinceIdx = args.indexOf('--since')
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : '2026-05-27'

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()

const { rows } = await client.query(`
  SELECT
    sr.business_name,
    sr.zip,
    sr.lead_email,
    sr.open_count,
    sr.last_opened_at,
    sr.opened_at AS first_opened_at,
    EXTRACT(EPOCH FROM (sr.last_opened_at - sr.opened_at))::int AS engagement_seconds,
    ol.owner_first_name,
    ol.city,
    ol.trade,
    ol.status,
    ol.call_attempted_at,
    ol.call_outcome
  FROM sample_reports sr
  LEFT JOIN outreach_leads ol ON LOWER(ol.email) = LOWER(sr.lead_email)
  WHERE sr.open_count > 0
    AND sr.last_opened_at >= $1::timestamptz
  ORDER BY sr.last_opened_at DESC
`, [since])

await client.end()

if (rows.length === 0) {
  console.log(`\n🟡 No report opens since ${since}.`)
  console.log(`   Wait a few hours after sending — HVAC owners typically check email evening/morning.`)
  console.log(`   Run again tomorrow morning to see overnight activity.\n`)
  process.exit(0)
}

console.log(`\n🔥 ${rows.length} HOT LEADS — opened their report since ${since}`)
console.log('═'.repeat(100))
for (const r of rows) {
  const minSinceOpen = r.last_opened_at ? Math.round((Date.now() - new Date(r.last_opened_at).getTime()) / 60000) : null
  const ago = minSinceOpen != null
    ? minSinceOpen < 60 ? `${minSinceOpen} min ago`
      : minSinceOpen < 1440 ? `${Math.round(minSinceOpen / 60)} hr ago`
      : `${Math.round(minSinceOpen / 1440)} d ago`
    : '—'
  const calledTag = r.call_attempted_at ? `📞 already called (${r.call_outcome})` : '☎ NOT YET CALLED — DIAL NOW'
  console.log(`  ${r.open_count}× opens · ${ago.padEnd(12)} · ${r.business_name}`)
  console.log(`    ${r.city}${r.trade ? ' · ' + r.trade : ''} · ${r.lead_email}`)
  console.log(`    ${calledTag}\n`)
}

console.log('═'.repeat(100))
console.log(`\n💡 Action: call the NOT YET CALLED ones first. Soft open:`)
console.log(`   "Hey, sent you a report on {business_name} yesterday — saw you opened it, anything caught your eye?"\n`)
