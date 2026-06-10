/**
 * Export 450 cold-outreach prospects to data/outreach-450.csv.
 *
 * Pulls from outreach_leads — Peter's scraped ICP pool. Filters for
 * deliverable rows (email + business_name + first name) and skips
 * anyone already in prospect_free_leads (de-dup against previous sends).
 *
 * Honest cap: AZ leads limited to 16 per T1 + Phoenix diagnostic
 * (only 16 qualified Phoenix leads exist in the leads table).
 *
 * Run:
 *   npx tsx scripts/export-outreach-450.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { writeFileSync, mkdirSync } from 'fs'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const TARGET_COUNT = 480
const AZ_CAP = 16  // matches qualified inventory per T1 diagnostic

async function main() {
  console.log(`Pulling up to ${TARGET_COUNT * 2} candidate prospects from outreach_leads…`)

  // Pull a larger pool than 450 so we can filter + dedup down.
  // 2026-06-10 — Peter chose 'Hey {biz_name}' greeting style.
  // owner_first_name dropped from filter — uses business_name in greeting.
  const { data, error } = await supabase
    .from('outreach_leads')
    .select('id, business_name, owner_first_name, email, city, state, trade')
    .not('email', 'is', null)
    .not('business_name', 'is', null)
    .limit(TARGET_COUNT * 3)

  if (error) {
    console.error('Query failed:', error)
    process.exit(1)
  }

  const candidates = (data || []) as {
    id: string
    business_name: string
    owner_first_name: string
    email: string
    city: string | null
    state: string | null
    trade: string | null
  }[]

  console.log(`Loaded ${candidates.length} raw candidates.`)

  // Dedup against prospects we've already mailed
  const { data: alreadyMailed } = await supabase
    .from('prospect_free_leads')
    .select('biz_id, email')
    .limit(10000)
  const mailedBizIds = new Set((alreadyMailed || []).map((r: { biz_id: string }) => r.biz_id))
  const mailedEmails = new Set((alreadyMailed || []).map((r: { email: string | null }) => (r.email || '').toLowerCase()))

  // Filter + sort
  let azCount = 0
  const filtered = candidates.filter((c) => {
    if (mailedBizIds.has(c.id)) return false
    if (mailedEmails.has(c.email.toLowerCase())) return false
    if (!c.email.includes('@')) return false
    if (c.state === 'AZ') {
      if (azCount >= AZ_CAP) return false
      azCount++
    }
    return true
  })

  console.log(`After dedup + AZ cap: ${filtered.length} eligible candidates.`)
  const final = filtered.slice(0, TARGET_COUNT)
  console.log(`Selecting top ${final.length}.`)

  // Emit CSV
  const header = 'biz_id,email,biz_name,firstname,trade,city,state,zip'
  const lines = [header]
  for (const c of final) {
    const cells = [
      c.id,
      c.email.trim(),
      (c.business_name || '').replace(/[",\n]/g, ' ').trim(),
      (c.owner_first_name || '').replace(/[",\n]/g, ' ').trim(),
      (c.trade || 'HVAC').toLowerCase().trim(),
      (c.city || '').replace(/[",\n]/g, ' ').trim(),
      (c.state || '').trim(),
      '',  // zip unknown — pre-pull script falls back to city+state lookup
    ]
    lines.push(cells.map((v) => /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(','))
  }

  mkdirSync(resolve(process.cwd(), 'data'), { recursive: true })
  const out = resolve(process.cwd(), 'data', 'outreach-450.csv')
  writeFileSync(out, lines.join('\n') + '\n', 'utf8')

  console.log(`\nWrote ${final.length} rows to ${out}`)

  // Stats
  const byState = new Map<string, number>()
  const byTrade = new Map<string, number>()
  for (const c of final) {
    byState.set(c.state || '?', (byState.get(c.state || '?') || 0) + 1)
    byTrade.set(c.trade || '?', (byTrade.get(c.trade || '?') || 0) + 1)
  }
  console.log('\nBy state (top 10):')
  for (const [s, n] of [...byState.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${s.padEnd(4)} ${n}`)
  }
  console.log('\nBy trade:')
  for (const [t, n] of [...byTrade.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(15)} ${n}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
