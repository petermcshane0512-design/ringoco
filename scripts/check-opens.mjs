import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

const r = await c.query(`
  SELECT business_name, open_count, last_opened_at, opened_at
  FROM sample_reports
  WHERE open_count > 0
  ORDER BY last_opened_at DESC
  LIMIT 20
`)

console.log(`Reports with opens > 0: ${r.rows.length}`)
for (const row of r.rows) {
  console.log(`  ${row.business_name} | opens: ${row.open_count} | last: ${row.last_opened_at}`)
}

const r2 = await c.query('SELECT count(*)::int as total, sum(open_count)::int as total_opens FROM sample_reports')
console.log(`\nTotal cached: ${r2.rows[0].total} | Total opens: ${r2.rows[0].total_opens || 0}`)

await c.end()
