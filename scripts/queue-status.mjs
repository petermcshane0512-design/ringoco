import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const r = await c.query(`SELECT status, count(*)::int as n FROM outreach_leads GROUP BY status ORDER BY n DESC`)
console.log('outreach_leads status breakdown:')
for (const row of r.rows) console.log(`  ${String(row.n).padStart(4)}  ${row.status}`)
const r2 = await c.query(`SELECT count(*)::int as n FROM outreach_leads WHERE status='queued' AND email IS NOT NULL`)
console.log(`\n📤 Queued + has email: ${r2.rows[0].n} ← Vercel cron will pull from here at 9 AM ET`)
await c.end()
