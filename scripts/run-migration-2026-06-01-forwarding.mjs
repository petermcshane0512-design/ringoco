#!/usr/bin/env node
import pg from 'pg'
import fs from 'node:fs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const FILE = 'C:\\Users\\peter\\ringoco\\sql\\2026-06-01-forwarding-diag.sql'

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
console.log('🟢 Connected to Supabase Postgres\n')

const name = FILE.split('\\').pop()
console.log(`▶ Running ${name}...`)
const sql = fs.readFileSync(FILE, 'utf8')
try {
  await c.query(sql)
  console.log(`  ✅ ${name} applied\n`)
} catch (e) {
  console.error(`  ❌ ${name} FAILED:`, e.message)
  await c.end()
  process.exit(1)
}

for (const col of ['forwarding_test_from', 'forwarding_test_strict_match']) {
  const { rows } = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
    ['profiles', col],
  )
  console.log(`  ${rows.length > 0 ? '✅' : '❌'} profiles.${col}`)
}

await c.end()
