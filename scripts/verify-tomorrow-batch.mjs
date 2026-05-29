import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const PLACEHOLDER = ['example.com', 'example.org', 'domain.com', 'yourcompany.com',
  'your@', 'youremail@', 'name@', 'email@', 'test@', 'demo@', 'sample@',
  'noreply@', 'no-reply@', 'donotreply', 'bobsrepair.com', 'impallari@']
const isPlaceholder = (e) => {
  if (!e || !e.includes('@')) return true
  const low = e.toLowerCase()
  if (PLACEHOLDER.some((p) => low.includes(p))) return true
  const local = low.split('@')[0]
  if (/^\d+$/.test(local)) return true
  if (local.length > 30) return true
  return false
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const r = await c.query(`
  SELECT
    ol.id, ol.email, ol.business_name, ol.city,
    (sr.report->'competitive'->>'yourReviewCount')::int AS reviews,
    sr.report IS NOT NULL AS has_report
  FROM outreach_leads ol
  LEFT JOIN sample_reports sr ON LOWER(sr.business_name) = LOWER(ol.business_name)
  WHERE ol.status = 'queued' AND ol.email IS NOT NULL
  ORDER BY ol.pushed_at ASC
  LIMIT 100
`)
let pass = 0, fail = 0
const failReasons = []
for (const row of r.rows) {
  let why = []
  if (isPlaceholder(row.email)) why.push('placeholder email')
  if (!row.has_report) why.push('no cached report')
  if (row.reviews != null && row.reviews >= 150) why.push('big boy')
  if (why.length === 0) pass++
  else {
    fail++
    if (failReasons.length < 10) failReasons.push(`  ❌ ${row.business_name} → ${row.email} | ${why.join(', ')}`)
  }
}
console.log(`✅ Sendable (pass all filters): ${pass}`)
console.log(`❌ Will be filtered at send time: ${fail}`)
if (failReasons.length > 0) {
  console.log('\nSample of leads that will be filtered:')
  for (const x of failReasons) console.log(x)
}
console.log(`\n📤 Tomorrow 9 AM ET: cron will deliver ${Math.min(50, pass)} small dogs to inbox.`)
await c.end()
