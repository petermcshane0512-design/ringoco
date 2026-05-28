import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

const r = await c.query(`
  SELECT business_name, zip, lead_email, campaign_id, generated_at
  FROM sample_reports
  WHERE business_name ~ '%[0-9A-F]{2}' OR business_name ILIKE '%Abeeffg%'
  ORDER BY generated_at DESC
`)

console.log(`Found ${r.rows.length} garbled rows:`)
for (const row of r.rows) console.log(JSON.stringify(row, null, 2))

await c.end()
