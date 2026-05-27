#!/usr/bin/env node
/**
 * run-migration.mjs — execute a SQL migration file against Supabase directly.
 *
 * USAGE
 *   node scripts/run-migration.mjs supabase-migrations/027_outreach_followup_tracking.sql
 *
 * ENV
 *   DATABASE_URL — direct Postgres connection string from Supabase Settings → Database
 *
 * Safety: prints the SQL + asks for --yes confirmation unless piped through
 * --auto. Wraps the whole file in a single transaction so partial application
 * never happens (CREATE TABLE half-applied is the worst).
 */

import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const args = process.argv.slice(2)
const auto = args.includes('--auto')
const sqlPath = args.find((a) => !a.startsWith('--'))

if (!sqlPath) {
  console.error('Usage: node scripts/run-migration.mjs <path-to-sql> [--auto]')
  process.exit(1)
}
if (!fs.existsSync(sqlPath)) {
  console.error(`File not found: ${sqlPath}`)
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('FATAL: DATABASE_URL not set in .env or .env.local')
  process.exit(1)
}

const sql = fs.readFileSync(sqlPath, 'utf8')
console.log(`📄 Migration: ${path.basename(sqlPath)} (${sql.length} bytes)`)
console.log('────────────────────────────────────────────────────────────')
console.log(sql.slice(0, 800) + (sql.length > 800 ? '\n  ... (truncated)' : ''))
console.log('────────────────────────────────────────────────────────────')

if (!auto) {
  console.log('Pass --auto to execute. Aborting.')
  process.exit(0)
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

console.log('🔌 Connecting...')
await client.connect()
console.log('   connected')

try {
  console.log('▶ Running migration inside a transaction...')
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')
  console.log('✅ Migration applied successfully')
} catch (e) {
  console.error('❌ Migration failed — rolling back:')
  console.error(`   ${e.message}`)
  try { await client.query('ROLLBACK') } catch {}
  process.exit(1)
} finally {
  await client.end()
}
