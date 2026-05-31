import pg from 'pg'
import fs from 'node:fs'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
console.log('🟢 Connected')
const sql = fs.readFileSync('C:\\Users\\peter\\ringoco\\sql\\2026-05-30-ai-pause.sql', 'utf8')
await c.query(sql)
console.log('✅ AI pause migration applied')

// Verify
const { rows } = await c.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('ai_paused_until','ai_pause_mode','ai_paused_reason')`,
)
console.log('Columns present:', rows.map((r) => r.column_name).join(', '))
await c.end()
