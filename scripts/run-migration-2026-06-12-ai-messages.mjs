#!/usr/bin/env node
// Applies sql/2026-06-12-lead-drops-ai-messages.sql via DATABASE_URL.
import dotenv from 'dotenv'
import fs from 'node:fs'
import pg from 'pg'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const FILE = 'C:\\Users\\peter\\ringoco\\sql\\2026-06-12-lead-drops-ai-messages.sql'

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
console.log('  ✓ connected')

try {
  await client.query(fs.readFileSync(FILE, 'utf8'))
  console.log('  ✅ 2026-06-12-lead-drops-ai-messages.sql applied')
} catch (e) {
  console.error(`  ❌ ${e.message}`)
  process.exitCode = 1
}

const v = await client.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'lead_drops'
    and column_name in ('ai_sms','ai_email_subject','ai_email_body','ai_generated_at')
`)
console.log(`  verification: ${v.rows.length}/4 columns present`)
await client.end()
