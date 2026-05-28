#!/usr/bin/env node
/**
 * crm-status.mjs — what's the state of paid customers + trials at a glance.
 *
 * Pulls from profiles + outreach_leads (joined where possible). Shows:
 *  - Active customers by tier
 *  - Trials in progress (signed up within last 7 days)
 *  - Recently churned
 *  - MRR / ARR estimate
 *  - Lead funnel snapshot (sent → opened → replied → trial → paid)
 *
 * USAGE
 *   node scripts/crm-status.mjs
 */

import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

const TIER_PRICES = { receptionist: 147, officemgr: 297, concierge: 597 }
const TIER_LABELS = { receptionist: 'Starter', officemgr: 'Pro', concierge: 'Elite' }

console.log('\n╔══════════════════════════════════════════════════════════════╗')
console.log('║ BellAveGo — CRM Snapshot                                      ║')
console.log('╚══════════════════════════════════════════════════════════════╝\n')

// Paid customers by tier
const tiers = await c.query(`
  SELECT plan_tier, count(*)::int as n
  FROM profiles
  WHERE is_active = true AND stripe_subscription_id IS NOT NULL
  GROUP BY plan_tier
`)
let mrr = 0
let totalCustomers = 0
console.log('💰 ACTIVE PAID CUSTOMERS:')
if (tiers.rowCount === 0) {
  console.log('   (none yet — keep sending)')
} else {
  for (const row of tiers.rows) {
    const price = TIER_PRICES[row.plan_tier] ?? 0
    const label = TIER_LABELS[row.plan_tier] ?? row.plan_tier
    const rev = price * row.n
    mrr += rev
    totalCustomers += row.n
    console.log(`   ${String(row.n).padStart(4)}  ${label.padEnd(10)} × $${price}/mo = $${rev}/mo`)
  }
  console.log(`   ${'─'.repeat(40)}`)
  console.log(`   MRR: $${mrr.toLocaleString()}  ·  ARR: $${(mrr * 12).toLocaleString()}`)
}

// Trials in progress
const trials = await c.query(`
  SELECT count(*)::int as n
  FROM profiles
  WHERE is_active = true
    AND stripe_subscription_id IS NOT NULL
    AND created_at > now() - interval '7 days'
`)
console.log(`\n🆕 TRIALS IN PROGRESS (signed up last 7 days): ${trials.rows[0].n}`)

// Outreach funnel
const fnl = await c.query(`
  SELECT status, count(*)::int as n
  FROM outreach_leads
  GROUP BY status
  ORDER BY n DESC
`)
console.log('\n📤 OUTREACH FUNNEL:')
for (const row of fnl.rows) {
  console.log(`   ${String(row.n).padStart(5)}  ${row.status}`)
}

// Opens this week
const opens = await c.query(`
  SELECT count(*)::int as n
  FROM sample_reports
  WHERE open_count > 0 AND last_opened_at > now() - interval '7 days'
`)
console.log(`\n👁  Report opens last 7 days: ${opens.rows[0].n}`)

await c.end()
console.log('')
