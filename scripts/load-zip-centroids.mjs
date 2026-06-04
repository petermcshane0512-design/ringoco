#!/usr/bin/env node
/**
 * One-time loader for the zip_centroids table.
 *
 * Reads ~42K US ZIP codes from the `zipcodes` npm package (Census-derived,
 * MIT licensed, bundled in repo deps) and bulk-inserts to Supabase. Run
 * once after applying sql/2026-06-04-zip-centroids.sql. Idempotent — uses
 * ON CONFLICT (zip) DO UPDATE so re-running keeps the table fresh.
 *
 * Source coverage: 50 states + DC + territories (PR, VI, GU, AS, MP).
 * Updated: package author refreshes from USPS quarterly.
 *
 * Runtime: ~30-60 sec for full load (batched 1000 rows at a time).
 */
import dotenv from 'dotenv'
import pg from 'pg'
import zipcodes from 'zipcodes'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()
console.log('  ✓ connected to Supabase')

// Pull every ZIP from the bundled dataset
const ALL = []
for (const z of Object.keys(zipcodes.codes)) {
  const r = zipcodes.codes[z]
  if (!r || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue
  ALL.push({
    zip: z,
    city: r.city || null,
    state: r.state || null,
    lat: r.latitude,
    lng: r.longitude,
  })
}
console.log(`  ✓ loaded ${ALL.length} ZIPs from zipcodes package`)

// Bulk insert in batches of 1000 (Postgres parameter limit considerations)
const BATCH = 1000
let inserted = 0
for (let i = 0; i < ALL.length; i += BATCH) {
  const batch = ALL.slice(i, i + BATCH)
  const values = []
  const params = []
  batch.forEach((r, idx) => {
    const base = idx * 5
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`)
    params.push(r.zip, r.city, r.state, r.lat, r.lng)
  })
  const sql = `
    insert into zip_centroids (zip, city, state, lat, lng)
    values ${values.join(', ')}
    on conflict (zip) do update set
      city = excluded.city,
      state = excluded.state,
      lat = excluded.lat,
      lng = excluded.lng,
      updated_at = now()
  `
  try {
    await client.query(sql, params)
    inserted += batch.length
    if (inserted % 5000 === 0 || inserted === ALL.length) {
      console.log(`  ✓ ${inserted}/${ALL.length} loaded`)
    }
  } catch (e) {
    console.error(`  ✗ batch ${i / BATCH} failed: ${e.message}`)
  }
}

// Sanity check
const { rows } = await client.query('select count(*)::int as n, count(distinct state)::int as states from zip_centroids')
console.log(`\n  ✓ zip_centroids contains ${rows[0].n} rows across ${rows[0].states} states`)

// Test the radius function with a sanity query
const test = await client.query(`select * from zips_within_miles($1, $2) limit 5`, ['85015', 5])
console.log(`  ✓ zips_within_miles('85015', 5) returns ${test.rowCount} ZIPs (first 5 shown):`)
for (const r of test.rows) console.log(`    ${r.zip} · ${r.dist_mi} mi`)

await client.end()
console.log('\nDONE — radius search ready')
