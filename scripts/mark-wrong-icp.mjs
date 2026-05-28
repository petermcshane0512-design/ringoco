import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

// Per Peter's 5/28 cold-call validation: 150+ review HVAC shops already have
// receptionists + marketing teams. They're not just non-buyers — the
// receptionist will kill our pitch at the door before reaching the owner.
// Real ICP = 5-150 reviews (1-5 employee teams who answer phone themselves).
//
// outreach_leads doesn't store review counts directly. We have to join via
// sample_reports.report->competitive->yourReviewCount which is the live
// Places data.
const r = await c.query(`
  UPDATE outreach_leads ol
  SET status = 'wrong_icp', updated_at = now()
  FROM sample_reports sr
  WHERE LOWER(sr.business_name) = LOWER(ol.business_name)
    AND ol.status = 'queued'
    AND (sr.report->'competitive'->>'yourReviewCount')::int >= 150
  RETURNING ol.business_name, (sr.report->'competitive'->>'yourReviewCount')::int as reviews
`)
console.log(`Marked ${r.rowCount} leads as wrong_icp (150+ reviews — too big, has receptionist):`)
for (const row of r.rows.slice(0, 10)) console.log(`   - ${row.business_name} (${row.reviews} reviews)`)
if (r.rowCount > 10) console.log(`   ... and ${r.rowCount - 10} more`)

// Show remaining real-ICP queue
const r2 = await c.query(`
  SELECT ol.id, ol.business_name, (sr.report->'competitive'->>'yourReviewCount')::int as reviews
  FROM outreach_leads ol
  LEFT JOIN sample_reports sr ON LOWER(sr.business_name) = LOWER(ol.business_name)
  WHERE ol.status = 'queued' AND ol.email IS NOT NULL
  ORDER BY reviews ASC NULLS LAST
`)
console.log(`\n✅ Remaining queue (real ICP, 5-150 reviews): ${r2.rowCount} leads`)
for (const row of r2.rows.slice(0, 15)) console.log(`   - ${row.business_name} (${row.reviews ?? '?'} reviews)`)

await c.end()
