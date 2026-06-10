/**
 * Measures real lead supply per metro per week from Supabase.
 *
 * For Task 1 of the offer-rebuild plan. Computes:
 *   - total qualified leads per week per metro for last 6 weeks
 *   - sustainable leads/wk/customer at 1, 5, 10 customer density
 *   - recommended LEADS_PER_WEEK number
 *
 * Run:  npx tsx scripts/measure-lead-supply.ts
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

// Best-effort metro classification by ZIP prefix.
// Doesn't need to be perfect — we want directional capacity sense, not exact.
const METRO_BY_ZIP_PREFIX: Record<string, string> = {
  '850': 'Phoenix AZ', '851': 'Phoenix AZ', '852': 'Phoenix AZ', '853': 'Phoenix AZ', '857': 'Tucson AZ',
  '750': 'Dallas-Fort Worth TX', '751': 'Dallas-Fort Worth TX', '752': 'Dallas-Fort Worth TX', '753': 'Dallas-Fort Worth TX', '760': 'Dallas-Fort Worth TX', '761': 'Dallas-Fort Worth TX', '762': 'Dallas-Fort Worth TX',
  '770': 'Houston TX', '771': 'Houston TX', '772': 'Houston TX', '773': 'Houston TX', '774': 'Houston TX', '775': 'Houston TX',
  '786': 'Austin TX', '787': 'Austin TX',
  '300': 'Atlanta GA', '301': 'Atlanta GA', '302': 'Atlanta GA', '303': 'Atlanta GA', '304': 'Atlanta GA', '305': 'Atlanta GA', '306': 'Atlanta GA',
  '328': 'Orlando FL', '347': 'Orlando FL',
  '331': 'Miami FL', '332': 'Miami FL', '333': 'Miami FL', '334': 'Miami FL',
  '606': 'Chicago IL', '604': 'Chicago IL', '601': 'Chicago IL', '602': 'Chicago IL', '603': 'Chicago IL', '605': 'Chicago IL',
  '372': 'Nashville TN', '370': 'Nashville TN', '371': 'Nashville TN',
  '282': 'Charlotte NC', '281': 'Charlotte NC', '280': 'Charlotte NC',
  '232': 'Raleigh NC', '275': 'Raleigh NC', '276': 'Raleigh NC',
}

function metroOf(zip: string | null): string {
  if (!zip) return 'unknown'
  const p = zip.slice(0, 3)
  return METRO_BY_ZIP_PREFIX[p] || `other (${p}xx)`
}

function isoWeek(d: Date): string {
  const target = new Date(d)
  target.setUTCHours(0, 0, 0, 0)
  // ISO week starts Monday
  const dayNum = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const weekNum = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

async function main() {
  const sixWeeksAgo = new Date(Date.now() - 42 * 86400000).toISOString()

  console.log('Querying `leads` table, created_at >=', sixWeeksAgo)
  console.log('')

  const { data, error, count } = await supabase
    .from('leads')
    .select('zip, created_at, lead_score, trade_match', { count: 'exact', head: false })
    .gte('created_at', sixWeeksAgo)
    .limit(50000)

  if (error) {
    console.error('Query failed:', error)
    process.exit(1)
  }

  console.log(`Total rows (last 6 wks): ${count}`)
  if (!data || data.length === 0) {
    console.log('No data. Either the leads table is empty or the column names differ.')
    process.exit(0)
  }

  // Group by week + metro
  type Key = string
  const counts = new Map<Key, number>()
  const qualifiedCounts = new Map<Key, number>() // score >= 70

  for (const row of data) {
    const r = row as { zip: string | null; created_at: string; lead_score: number | null; trade_match: string[] | null }
    if (!r.created_at) continue
    const wk = isoWeek(new Date(r.created_at))
    const metro = metroOf(r.zip)
    const key = `${metro}\t${wk}`
    counts.set(key, (counts.get(key) || 0) + 1)
    if ((r.lead_score ?? 0) >= 70) qualifiedCounts.set(key, (qualifiedCounts.get(key) || 0) + 1)
  }

  // Aggregate per metro across all weeks
  const perMetroTotal = new Map<string, { total: number; qualified: number; weeks: Set<string> }>()
  for (const [key, count] of counts.entries()) {
    const [metro, wk] = key.split('\t')
    const m = perMetroTotal.get(metro) || { total: 0, qualified: 0, weeks: new Set<string>() }
    m.total += count
    m.qualified += qualifiedCounts.get(key) || 0
    m.weeks.add(wk)
    perMetroTotal.set(metro, m)
  }

  // Print metro-level table
  console.log('\n=== Per-metro weekly average (qualified score ≥ 70) ===')
  console.log('Metro                          | wks observed | total qualified | avg/wk | /wk @ 1 cust | /wk @ 5 cust | /wk @ 10 cust')
  console.log('-------------------------------|--------------|-----------------|--------|--------------|--------------|---------------')
  const rows = [...perMetroTotal.entries()]
    .map(([metro, m]) => {
      const avgPerWeek = m.qualified / Math.max(1, m.weeks.size)
      return {
        metro,
        weeks: m.weeks.size,
        qualified: m.qualified,
        avgPerWeek,
        at1: avgPerWeek,
        at5: avgPerWeek / 5,
        at10: avgPerWeek / 10,
      }
    })
    .sort((a, b) => b.qualified - a.qualified)

  for (const r of rows.slice(0, 25)) {
    console.log(
      `${r.metro.padEnd(30)} | ${String(r.weeks).padEnd(12)} | ${String(r.qualified).padEnd(15)} | ${r.avgPerWeek.toFixed(1).padEnd(6)} | ${r.at1.toFixed(1).padEnd(12)} | ${r.at5.toFixed(1).padEnd(12)} | ${r.at10.toFixed(1)}`,
    )
  }

  // Per-week breakdown for Phoenix specifically
  console.log('\n=== Phoenix AZ per-week breakdown ===')
  const phxRows = [...counts.entries()]
    .filter(([k]) => k.startsWith('Phoenix AZ\t'))
    .map(([k, total]) => ({ wk: k.split('\t')[1], total, qualified: qualifiedCounts.get(k) || 0 }))
    .sort((a, b) => a.wk.localeCompare(b.wk))
  if (phxRows.length === 0) {
    console.log('No Phoenix data in last 6 weeks.')
  } else {
    console.log('Week     | total | qualified (≥70)')
    console.log('---------|-------|----------------')
    for (const r of phxRows) console.log(`${r.wk} | ${String(r.total).padEnd(5)} | ${r.qualified}`)
  }

  console.log('\n=== Trade distribution (qualified leads) ===')
  const tradeCounts = new Map<string, number>()
  for (const row of data) {
    const r = row as { lead_score: number | null; trade_match: string[] | null }
    if ((r.lead_score ?? 0) < 70) continue
    const trades = r.trade_match || []
    for (const t of trades) tradeCounts.set(t, (tradeCounts.get(t) || 0) + 1)
  }
  for (const [t, c] of [...tradeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${t.padEnd(15)} ${c}`)
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
