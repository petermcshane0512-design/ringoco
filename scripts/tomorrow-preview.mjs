import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

const r = await c.query(`
  SELECT ol.city, ol.state, count(*)::int as n
  FROM outreach_leads ol
  WHERE ol.status = 'queued' AND ol.email IS NOT NULL
  GROUP BY ol.city, ol.state
  ORDER BY n DESC
`)
console.log('Small-dog queue ready for tomorrow:\n')
let total = 0
for (const row of r.rows) {
  console.log(`  ${String(row.n).padStart(4)}  ${(row.city ?? '?').padEnd(20)} ${row.state ?? ''}`)
  total += row.n
}
console.log(`\nTotal queued: ${total}\n`)

// Show sample of top 10 to send
const top = await c.query(`
  SELECT ol.business_name, ol.email, ol.city,
         (sr.report->'competitive'->>'yourReviewCount')::int AS reviews
  FROM outreach_leads ol
  LEFT JOIN sample_reports sr ON LOWER(sr.business_name) = LOWER(ol.business_name)
  WHERE ol.status = 'queued' AND ol.email IS NOT NULL
  ORDER BY ol.pushed_at ASC
  LIMIT 10
`)
console.log('First 10 to fire tomorrow (cron pulls oldest-queued first):')
for (const x of top.rows) {
  console.log(`  - ${x.business_name} (${x.city ?? '?'}, ${x.reviews ?? '?'} reviews) → ${x.email}`)
}

await c.end()
