/**
 * Audit outreach_leads pool + show what the learning agents have figured out.
 *
 * Answers: how many prospects exist? Why is my export pulling only 9?
 * What does outreach_trade_segments say about which trade converts best?
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

async function main() {
  // 1. Total pool
  const { count: total } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
  console.log(`outreach_leads total rows: ${total}`)

  // 2. With email
  const { count: withEmail } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .not('email', 'is', null)
  console.log(`  + has email: ${withEmail}`)

  const { count: withBoth } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .not('email', 'is', null)
    .not('business_name', 'is', null)
  console.log(`  + email + business_name: ${withBoth}`)

  const { count: withAll } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .not('email', 'is', null)
    .not('business_name', 'is', null)
    .not('owner_first_name', 'is', null)
  console.log(`  + email + name + firstname: ${withAll}`)

  // 3. Recent rows
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { count: recent } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo)
  console.log(`\nlast 7 days inserts: ${recent}`)

  // 4. By trade
  const { data: byTrade } = await supabase
    .from('outreach_leads')
    .select('trade')
    .not('trade', 'is', null)
    .limit(10000)
  const tradeCounts = new Map<string, number>()
  for (const r of (byTrade || []) as { trade: string }[]) {
    tradeCounts.set(r.trade, (tradeCounts.get(r.trade) || 0) + 1)
  }
  console.log('\nBy trade:')
  for (const [t, c] of [...tradeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${t.padEnd(30)} ${c}`)
  }

  // 5. By state
  const { data: byState } = await supabase
    .from('outreach_leads')
    .select('state')
    .not('state', 'is', null)
    .limit(10000)
  const stateCounts = new Map<string, number>()
  for (const r of (byState || []) as { state: string }[]) {
    stateCounts.set(r.state, (stateCounts.get(r.state) || 0) + 1)
  }
  console.log('\nBy state:')
  for (const [s, c] of [...stateCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${s.padEnd(4)} ${c}`)
  }

  // 6. Outreach-learner output
  console.log('\n=== outreach_trade_segments (which trade converts best) ===')
  const { data: segments, error: segErr } = await supabase
    .from('outreach_trade_segments')
    .select('*')
    .order('computed_at', { ascending: false })
    .limit(20)
  if (segErr) console.log(`  table missing or error: ${segErr.message}`)
  else if (!segments || segments.length === 0) console.log('  no rows yet (learner has not run successfully)')
  else {
    for (const s of segments as Record<string, unknown>[]) {
      console.log(`  ${JSON.stringify(s).slice(0, 200)}`)
    }
  }

  // 7. Outreach learnings
  console.log('\n=== outreach_learnings (subject/step performance) ===')
  const { data: learnings, error: learnErr } = await supabase
    .from('outreach_learnings')
    .select('*')
    .order('computed_at', { ascending: false })
    .limit(10)
  if (learnErr) console.log(`  table missing or error: ${learnErr.message}`)
  else if (!learnings || learnings.length === 0) console.log('  no rows yet')
  else {
    for (const l of learnings as Record<string, unknown>[]) {
      console.log(`  ${JSON.stringify(l).slice(0, 250)}`)
    }
  }

  // 8. Recent daily-200 source tags (proves cron is firing)
  console.log('\n=== daily-200 cron source tags (last 14 days) ===')
  const { data: sources } = await supabase
    .from('outreach_leads')
    .select('source, created_at')
    .like('source', 'daily-200-%')
    .order('created_at', { ascending: false })
    .limit(2000)
  const dayCounts = new Map<string, number>()
  for (const r of (sources || []) as { source: string }[]) {
    dayCounts.set(r.source, (dayCounts.get(r.source) || 0) + 1)
  }
  if (dayCounts.size === 0) {
    console.log('  CRON HAS NEVER FIRED — no daily-200-* source tags found')
  } else {
    for (const [s, c] of [...dayCounts.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1).slice(0, 20)) {
      console.log(`  ${s.padEnd(20)} ${c}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
