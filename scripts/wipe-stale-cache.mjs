import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

// Delete cached reports that contain the SAMPLE_REPORT fallback signature
// (yourReviewCount=47 + Northern Air Mechanical as top competitor). Those
// were generated before the resolveProspectPlaceId fix landed and now sit
// in cache forever blocking real-data regeneration.
const r = await c.query(`
  DELETE FROM sample_reports
  WHERE (report->'competitive'->>'yourReviewCount')::int = 47
    AND report->'competitive'->'competitors'->0->>'name' = 'Northern Air Mechanical'
  RETURNING business_name, zip
`)
console.log(`🧹 Deleted ${r.rowCount} stale fallback rows from sample_reports`)
for (const row of r.rows.slice(0, 10)) console.log(`   - ${row.business_name} (${row.zip})`)
if (r.rowCount > 10) console.log(`   ... and ${r.rowCount - 10} more`)

await c.end()
