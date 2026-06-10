/**
 * Phoenix scraper diagnostic — why zero qualified leads in last 42 days?
 *
 * Per T1 supply audit, the Phoenix metro (zip 850-853 / 857) returned
 * ZERO leads across the entire 6-week window. Either the scraper isn't
 * running, isn't pulling from Phoenix, or every result is being
 * filtered out before insert.
 *
 * This script checks each layer of the pipeline and reports where the
 * break is.
 *
 * Run:
 *   vercel env pull .env.local
 *   npx tsx scripts/diagnose-phoenix-scraper.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const PHOENIX_ZIPS = ['85001', '85003', '85004', '85007', '85008', '85016', '85020', '85021', '85027', '85031', '85033', '85040', '85041', '85044', '85048', '85254', '85710', '85718', '85719']
const SIX_WEEKS_AGO = new Date(Date.now() - 42 * 86400000).toISOString()

async function main() {
  console.log('=== Layer 1: leads table — any Phoenix rows at all in last 42 days? ===')
  const { count: totalCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('zip', PHOENIX_ZIPS)
    .gte('created_at', SIX_WEEKS_AGO)
  console.log(`  Phoenix leads w/ any score: ${totalCount ?? 0}`)

  const { count: qualCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('zip', PHOENIX_ZIPS)
    .gte('lead_score', 70)
    .gte('created_at', SIX_WEEKS_AGO)
  console.log(`  Phoenix leads w/ score >= 70: ${qualCount ?? 0}`)

  console.log('\n=== Layer 2: leads.source breakdown for Phoenix in last 42 days ===')
  const { data: sources } = await supabase
    .from('leads')
    .select('source')
    .in('zip', PHOENIX_ZIPS)
    .gte('created_at', SIX_WEEKS_AGO)
    .limit(10000)
  const sourceCounts = new Map<string, number>()
  for (const r of (sources || []) as { source: string }[]) {
    sourceCounts.set(r.source, (sourceCounts.get(r.source) || 0) + 1)
  }
  if (sourceCounts.size === 0) {
    console.log('  NO rows. Scraper hasn\'t inserted anything to Phoenix zips at all.')
  } else {
    for (const [s, c] of [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${s.padEnd(40)} ${c}`)
    }
  }

  console.log('\n=== Layer 3: cron run history for Phoenix scraper ===')
  // Check if there's a cron-run log table. If not, look at the leads
  // table for the most recent Phoenix-zip insert from any source.
  const { data: lastPhoenix } = await supabase
    .from('leads')
    .select('created_at, source, zip')
    .in('zip', PHOENIX_ZIPS)
    .order('created_at', { ascending: false })
    .limit(5)
  if (lastPhoenix && lastPhoenix.length > 0) {
    console.log('  Most recent 5 Phoenix-zip inserts:')
    for (const r of lastPhoenix as { created_at: string; source: string; zip: string }[]) {
      const daysAgo = Math.round((Date.now() - new Date(r.created_at).getTime()) / 86400000)
      console.log(`    ${r.created_at}  zip=${r.zip}  source=${r.source}  (${daysAgo} days ago)`)
    }
  } else {
    console.log('  ZERO Phoenix-zip rows in the entire leads table. Scraper has never written here.')
  }

  console.log('\n=== Layer 4: BatchData Property Search test (live API ping) ===')
  if (!process.env.BATCHDATA_API_KEY) {
    console.log('  BATCHDATA_API_KEY not set — cannot live-test. Skipping.')
  } else {
    // Minimal probe — just see if BatchData returns ANY properties for 85016.
    const url = 'https://api.batchdata.com/api/v1/property/search'
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.BATCHDATA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchCriteria: {
            zip: '85016',
            ownerOccupiedOnly: true,
            quickList: 'recently-sold',
          },
          options: { take: 5 },
        }),
      })
      const data = await res.json() as { results?: { properties?: unknown[] }; status?: string; message?: string }
      const props = data.results?.properties || []
      console.log(`  BatchData zip=85016 returned ${props.length} property/ies. HTTP ${res.status}.`)
      if (res.status >= 400) {
        console.log(`    error: ${data.message || JSON.stringify(data).slice(0, 200)}`)
      }
    } catch (e) {
      console.log(`  BatchData probe error: ${(e as Error).message}`)
    }
  }

  console.log('\n=== Verdict ===')
  console.log('  If Layer 1 shows 0 + Layer 2 shows no rows: cron not running. Check /api/crons/scrape-permits-phoenix Vercel logs.')
  console.log('  If Layer 1 shows rows but Layer 2 is missing some source: that source scraper is broken individually.')
  console.log('  If Layer 4 returns 0 properties: BatchData credentials or query criteria are off.')
  console.log('  If Layer 4 returns properties but Layer 1 is 0: find-real-leads isn\'t firing for any Phoenix tenant.')

  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
