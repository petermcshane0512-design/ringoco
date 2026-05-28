import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

// All leads marked sent today, joined with their cached report's review count
const r = await c.query(`
  SELECT
    ol.email,
    ol.business_name,
    (sr.report->'competitive'->>'yourReviewCount')::int AS reviews,
    ol.updated_at
  FROM outreach_leads ol
  LEFT JOIN sample_reports sr
    ON LOWER(sr.business_name) = LOWER(ol.business_name)
  WHERE ol.status = 'sent'
    AND ol.updated_at >= '2026-05-28T00:00:00Z'
  ORDER BY ol.updated_at DESC
`)

const small = r.rows.filter((x) => x.reviews != null && x.reviews < 150)
const big = r.rows.filter((x) => x.reviews != null && x.reviews >= 150)
const unknown = r.rows.filter((x) => x.reviews == null)

console.log(`Sent today (status=sent, updated 5/28):  ${r.rowCount}`)
console.log(`  🟢 Small dogs (<150 reviews):           ${small.length}`)
console.log(`  🟡 Big boys (150+ reviews):             ${big.length}`)
console.log(`  ❓ Unknown (no cached report):          ${unknown.length}`)
console.log(`\nSmall-dog sample (first 10):`)
for (const x of small.slice(0, 10)) console.log(`  - ${x.business_name} (${x.reviews} reviews) ${x.email}`)

// Also count from send-via-gmail log files (catches the CSV-sourced batches that
// didn't lead-id back to outreach_leads).
import fs from 'node:fs'
const logsDir = 'C:\\Users\\peter\\AppData\\Local\\Temp\\claude\\C--Users-peter\\b52def04-10cc-4289-901b-06b2d4eb0f2f\\tasks'
const today = new Date()
today.setHours(0, 0, 0, 0)
const logFiles = fs.readdirSync(logsDir).filter((f) => f.endsWith('.output')).filter((f) => {
  const st = fs.statSync(`${logsDir}\\${f}`)
  return st.mtime >= today
})
const sentEmails = new Set()
for (const f of logFiles) {
  const txt = fs.readFileSync(`${logsDir}\\${f}`, 'utf8')
  for (const m of txt.matchAll(/\[(\d+)\/\d+\]\s+([\w.+-]+@[\w.-]+\.[a-z]{2,})/gi)) {
    sentEmails.add(m[2].toLowerCase())
  }
}
console.log(`\n📨 Total unique emails seen in today's send logs: ${sentEmails.size}`)

await c.end()
