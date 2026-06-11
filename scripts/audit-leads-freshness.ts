/**
 * Freshness + geography audit of the leads table.
 *
 * Per Fable 5 review: 28K row count means nothing if 90% are stale.
 * Permit + storm signals decay fast — a lead about a permit pulled
 * 90+ days ago looks like a scammer when the contractor calls.
 *
 * Outputs:
 *   1. Total rows + qualified (score >= 70)
 *   2. Per-metro × age-bucket (<30d / 30-90d / >90d) breakdown
 *   3. By source × age (permit/storm/aged/move_in)
 *   4. Phoenix-specific zoom (Peter's stated target)
 *
 * Run:
 *   npx tsx scripts/audit-leads-freshness.ts
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

const METRO_BY_ZIP_PREFIX: Record<string, string> = {
  // Sun Belt focus + a handful of grandfathered Northeast prefixes
  '850': 'Phoenix AZ', '851': 'Phoenix AZ', '852': 'Phoenix AZ', '853': 'Phoenix AZ',
  '857': 'Tucson AZ',
  '750': 'Dallas-FW TX', '751': 'Dallas-FW TX', '752': 'Dallas-FW TX', '753': 'Dallas-FW TX',
  '760': 'Dallas-FW TX', '761': 'Dallas-FW TX', '762': 'Dallas-FW TX',
  '770': 'Houston TX', '771': 'Houston TX', '772': 'Houston TX', '773': 'Houston TX', '774': 'Houston TX', '775': 'Houston TX',
  '786': 'Austin TX', '787': 'Austin TX',
  '300': 'Atlanta GA', '301': 'Atlanta GA', '302': 'Atlanta GA', '303': 'Atlanta GA',
  '328': 'Orlando FL', '347': 'Orlando FL',
  '331': 'Miami FL', '332': 'Miami FL', '333': 'Miami FL', '334': 'Miami FL',
  '606': 'Chicago IL', '604': 'Chicago IL', '601': 'Chicago IL',
  '372': 'Nashville TN', '370': 'Nashville TN',
  '282': 'Charlotte NC', '281': 'Charlotte NC',
}

function metroOf(zip: string | null): string {
  if (!zip) return '?'
  return METRO_BY_ZIP_PREFIX[zip.slice(0, 3)] || `other (${zip.slice(0, 3)}xx)`
}

function ageBucket(createdAt: string): '<30d' | '30-90d' | '>90d' {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86400000
  if (days < 30) return '<30d'
  if (days < 90) return '30-90d'
  return '>90d'
}

async function main() {
  // Pull a representative sample so this doesn't time out on 28K rows.
  // For metric purposes 20K is plenty.
  console.log('Querying up to 20K leads (qualified score >= 70)…\n')
  const { data, error, count } = await supabase
    .from('leads')
    .select('zip, source, created_at, lead_score, trade_match', { count: 'exact' })
    .gte('lead_score', 70)
    .order('created_at', { ascending: false })
    .limit(20000)

  if (error) {
    console.error('Query failed:', error)
    process.exit(1)
  }

  type Row = { zip: string | null; source: string | null; created_at: string; trade_match: string[] | null }
  const rows = (data || []) as Row[]
  console.log(`Total qualified in DB: ${count}`)
  console.log(`Sampled: ${rows.length}\n`)

  // === 1. By age bucket (overall) ===
  console.log('=== Age bucket × Source ===')
  const ageSource = new Map<string, number>()
  for (const r of rows) {
    if (!r.created_at) continue
    const key = `${ageBucket(r.created_at)} | ${r.source || '?'}`
    ageSource.set(key, (ageSource.get(key) || 0) + 1)
  }
  const ageBuckets = ['<30d', '30-90d', '>90d']
  const sources = ['permit', 'storm', 'aged', 'move_in', 'aging_hvac', 'census_aging']
  console.log('source         | <30d   | 30-90d | >90d')
  console.log('---------------|--------|--------|--------')
  for (const s of sources) {
    const counts = ageBuckets.map((b) => ageSource.get(`${b} | ${s}`) || 0)
    if (counts.every((c) => c === 0)) continue
    console.log(`${s.padEnd(14)} | ${String(counts[0]).padEnd(6)} | ${String(counts[1]).padEnd(6)} | ${counts[2]}`)
  }

  // === 2. Per-metro ages ===
  console.log('\n=== Per-metro freshness (qualified leads) ===')
  console.log('metro                          | total   | <30d    | 30-90d  | >90d')
  console.log('-------------------------------|---------|---------|---------|--------')
  const metroAge = new Map<string, [number, number, number]>()  // [<30, 30-90, >90]
  for (const r of rows) {
    if (!r.created_at) continue
    const m = metroOf(r.zip)
    const buck = ageBucket(r.created_at)
    const cur = metroAge.get(m) || [0, 0, 0]
    if (buck === '<30d') cur[0]++
    else if (buck === '30-90d') cur[1]++
    else cur[2]++
    metroAge.set(m, cur)
  }
  const metros = [...metroAge.entries()]
    .map(([m, c]) => ({ m, total: c[0] + c[1] + c[2], c }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 25)
  for (const { m, total, c } of metros) {
    console.log(`${m.padEnd(30)} | ${String(total).padEnd(7)} | ${String(c[0]).padEnd(7)} | ${String(c[1]).padEnd(7)} | ${c[2]}`)
  }

  // === 3. Phoenix zoom ===
  console.log('\n=== Phoenix AZ deep-dive (zip prefix 850/851/852/853) ===')
  const phx = rows.filter((r) => r.zip && ['850', '851', '852', '853'].includes(r.zip.slice(0, 3)))
  if (phx.length === 0) {
    console.log('  ZERO Phoenix qualified leads sampled.')
  } else {
    const phxAge = [0, 0, 0]
    const phxSrc = new Map<string, number>()
    for (const r of phx) {
      const buck = ageBucket(r.created_at)
      if (buck === '<30d') phxAge[0]++
      else if (buck === '30-90d') phxAge[1]++
      else phxAge[2]++
      phxSrc.set(r.source || '?', (phxSrc.get(r.source || '?') || 0) + 1)
    }
    console.log(`  Total: ${phx.length} | <30d: ${phxAge[0]} | 30-90d: ${phxAge[1]} | >90d: ${phxAge[2]}`)
    console.log(`  Sources:`)
    for (const [s, c] of [...phxSrc.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${s.padEnd(20)} ${c}`)
    }
  }

  // === 4. Trade × age ===
  console.log('\n=== Trade × Freshness (qualified) ===')
  const trades = ['hvac', 'plumbing', 'electrical', 'roofing', 'handyman']
  console.log('trade           | total  | <30d   | 30-90d | >90d')
  console.log('----------------|--------|--------|--------|--------')
  for (const t of trades) {
    const tRows = rows.filter((r) => (r.trade_match || []).includes(t))
    const tAge = [0, 0, 0]
    for (const r of tRows) {
      const buck = ageBucket(r.created_at)
      if (buck === '<30d') tAge[0]++
      else if (buck === '30-90d') tAge[1]++
      else tAge[2]++
    }
    console.log(`${t.padEnd(15)} | ${String(tRows.length).padEnd(6)} | ${String(tAge[0]).padEnd(6)} | ${String(tAge[1]).padEnd(6)} | ${tAge[2]}`)
  }

  console.log('\nFreshness rule of thumb:')
  console.log('  <30d  = "I saw your permit go in last week" (warm)')
  console.log('  30-90d = "Sorry about the delay" (cold-ish)')
  console.log('  >90d  = "Why is this still being called?" (stale, drop)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
