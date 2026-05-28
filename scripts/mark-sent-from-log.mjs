import fs from 'node:fs'
import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const logPath = process.argv[2]
if (!logPath || !fs.existsSync(logPath)) {
  console.error('Usage: node scripts/mark-sent-from-log.mjs <send-log-path>')
  process.exit(1)
}
const log = fs.readFileSync(logPath, 'utf8')
// Pull every email that the send loop confirmed as ✅ sent.
const sent = [...log.matchAll(/\[(\d+)\/\d+\]\s+([\w.+-]+@[\w.-]+\.[a-z]{2,})/gi)]
  .map((m) => m[2].toLowerCase())
const unique = [...new Set(sent)]
console.log(`Found ${unique.length} unique emails in send log`)

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const r = await c.query(
  `UPDATE outreach_leads SET status='sent', updated_at=now() WHERE LOWER(email) = ANY($1::text[]) AND status != 'sent' RETURNING email`,
  [unique],
)
console.log(`Marked ${r.rowCount} leads as sent in outreach_leads`)
await c.end()
