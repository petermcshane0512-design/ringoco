#!/usr/bin/env node
import pg from 'pg'
import fs from 'node:fs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const FILES = [
  'C:\\Users\\peter\\ringoco\\sql\\2026-05-30-outreach-calls.sql',
  'C:\\Users\\peter\\ringoco\\sql\\2026-05-30-lead-scoring.sql',
  'C:\\Users\\peter\\ringoco\\sql\\2026-05-30-hunter-verification.sql',
  'C:\\Users\\peter\\ringoco\\sql\\2026-05-30-ai-pause.sql',
]

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
console.log('🟢 Connected to Supabase Postgres\n')

for (const f of FILES) {
  const name = f.split('\\').pop()
  console.log(`▶ Running ${name}...`)
  const sql = fs.readFileSync(f, 'utf8')
  try {
    await c.query(sql)
    console.log(`  ✅ ${name} applied\n`)
  } catch (e) {
    console.error(`  ❌ ${name} FAILED:`, e.message)
    console.error(`  Stopping migration sequence.`)
    await c.end()
    process.exit(1)
  }
}

console.log('🎉 All 3 migrations applied successfully.')

// Confirm columns exist
const checks = [
  { table: 'outreach_calls', column: 'lead_id' },
  { table: 'outreach_leads', column: 'first_opened_at' },
  { table: 'outreach_leads', column: 'buyer_score' },
  { table: 'outreach_leads', column: 'caller_consent_at' },
  { table: 'outreach_leads', column: 'hunter_verified_at' },
  { table: 'lead_scoring_signals', column: 'outcome' },
  { table: 'lead_scoring_prompts', column: 'is_active' },
]
for (const ck of checks) {
  const { rows } = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
    [ck.table, ck.column],
  )
  const ok = rows.length > 0 ? '✅' : '❌'
  console.log(`  ${ok} ${ck.table}.${ck.column}`)
}

await c.end()
