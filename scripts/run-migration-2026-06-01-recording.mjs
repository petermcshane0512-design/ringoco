#!/usr/bin/env node
import pg from 'pg'
import fs from 'node:fs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const FILE = 'C:\\Users\\peter\\ringoco\\sql\\2026-06-01-call-recording-url.sql'

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
console.log('🟢 Connected\n')

await c.query(fs.readFileSync(FILE, 'utf8'))
console.log('  ✅ recording_url migration applied')

const { rows } = await c.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name='call_logs' AND column_name='recording_url'`,
)
console.log(`  ${rows.length > 0 ? '✅' : '❌'} call_logs.recording_url`)

await c.end()
