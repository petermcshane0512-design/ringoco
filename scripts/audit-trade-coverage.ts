/**
 * Audit trade differentiation + nationwide coverage.
 *
 * Answers:
 *   1. Does `leads` table have trade-tagged inventory for all 5 trades?
 *   2. Coverage by zip prefix (do we have nationwide inventory)?
 *   3. Would an electrician signing up get different leads than an HVAC
 *      contractor in the same zip?
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

const TRADES = ['hvac', 'plumbing', 'electrical', 'roofing', 'handyman']

async function main() {
  console.log('=== 1. Trade-tagged inventory in `leads` ===')
  for (const t of TRADES) {
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .contains('trade_match', [t])
    const { count: scored } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .contains('trade_match', [t])
      .gte('lead_score', 70)
    console.log(`  ${t.padEnd(15)} total=${count ?? 0}  qualified(>=70)=${scored ?? 0}`)
  }

  console.log('\n=== 2. Nationwide ZIP coverage (1st digit = census region) ===')
  const { data: sample } = await supabase
    .from('leads')
    .select('zip')
    .not('zip', 'is', null)
    .limit(20000)
  const byRegion = new Map<string, number>()
  const labels: Record<string, string> = {
    '0': 'CT/MA/ME/NH/NJ/PR/RI/VT',
    '1': 'DE/NY/PA',
    '2': 'DC/MD/NC/SC/VA/WV',
    '3': 'AL/FL/GA/MS/TN',
    '4': 'IN/KY/MI/OH',
    '5': 'IA/MN/MT/ND/SD/WI',
    '6': 'IL/KS/MO/NE',
    '7': 'AR/LA/OK/TX',
    '8': 'AZ/CO/ID/NM/NV/UT/WY',
    '9': 'AK/CA/HI/OR/WA',
  }
  for (const r of (sample || []) as { zip: string }[]) {
    const first = r.zip.slice(0, 1)
    byRegion.set(first, (byRegion.get(first) || 0) + 1)
  }
  for (const k of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    const count = byRegion.get(k) || 0
    console.log(`  ${k}xxxx (${labels[k].padEnd(28)}) ${count}`)
  }

  console.log('\n=== 3. Same-zip cross-trade test (do trades get DIFFERENT leads?) ===')
  // Pick a zip w/ HVAC inventory + see what other trades surface there
  const { data: pickZip } = await supabase
    .from('leads')
    .select('zip')
    .contains('trade_match', ['hvac'])
    .gte('lead_score', 70)
    .limit(1)
  const sampleZip = (pickZip as { zip: string }[] | null)?.[0]?.zip
  if (!sampleZip) {
    console.log('  no HVAC inventory found for test')
  } else {
    console.log(`  Test zip: ${sampleZip}`)
    for (const t of TRADES) {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('zip', sampleZip)
        .contains('trade_match', [t])
      console.log(`    ${t.padEnd(15)} count in ${sampleZip}: ${count ?? 0}`)
    }
  }

  console.log('\n=== 4. trade_match distribution (top 20 unique tag combos) ===')
  const { data: tagSamples } = await supabase
    .from('leads')
    .select('trade_match')
    .not('trade_match', 'is', null)
    .limit(10000)
  const tagCounts = new Map<string, number>()
  for (const r of (tagSamples || []) as { trade_match: string[] }[]) {
    const sig = [...(r.trade_match || [])].sort().join(',')
    tagCounts.set(sig, (tagCounts.get(sig) || 0) + 1)
  }
  for (const [t, c] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${t.padEnd(40)} ${c}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
