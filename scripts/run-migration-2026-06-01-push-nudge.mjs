#!/usr/bin/env node
import pg from 'pg'
import fs from 'node:fs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const FILE = 'C:\\Users\\peter\\ringoco\\sql\\2026-06-01-push-nudge.sql'

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
console.log('🟢 Connected to Supabase Postgres\n')

console.log('▶ Running push-nudge migration...')
await c.query(fs.readFileSync(FILE, 'utf8'))
console.log('  ✅ applied\n')

const { rows } = await c.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name='push_nudge_sent_at'`,
)
console.log(`  ${rows.length > 0 ? '✅' : '❌'} profiles.push_nudge_sent_at`)

await c.end()
