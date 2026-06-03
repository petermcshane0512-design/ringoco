#!/usr/bin/env node
/**
 * One-shot SQL runner for the two pending migrations.
 * Uses pg via DATABASE_URL (Supabase session pooler).
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import pg from 'pg'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const FILES = [
  'C:\\Users\\peter\\ringoco\\sql\\2026-06-02-health-snapshots.sql',
  'C:\\Users\\peter\\ringoco\\sql\\2026-06-02-outreach-leads-report-sms.sql',
]

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
console.log('  ✓ connected to Supabase')

for (const f of FILES) {
  const sql = fs.readFileSync(f, 'utf8')
  const name = f.split('\\').pop()
  console.log(`\n→ running ${name}`)
  try {
    await client.query(sql)
    console.log(`  ✅ ${name} applied`)
  } catch (e) {
    console.error(`  ❌ ${name}: ${e.message}`)
  }
}

// Verify tables exist
const v = await client.query(`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name in ('health_snapshots', 'outreach_leads')
`)
console.log('\nVerification:')
for (const r of v.rows) console.log(`  ✓ ${r.table_name}`)

const colCheck = await client.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'outreach_leads'
    and column_name = 'last_report_sms_sent_at'
`)
console.log(colCheck.rows.length > 0
  ? `  ✓ outreach_leads.last_report_sms_sent_at column added`
  : `  ❌ outreach_leads.last_report_sms_sent_at column NOT FOUND`)

await client.end()
