#!/usr/bin/env node
/**
 * daily-funnel.mjs — yesterday-vs-today metrics dashboard.
 *
 * Prints the full cold-outbound funnel for the last 24h (or arbitrary range)
 * grouped by trade + city + copy variant + score bucket. Designed to be the
 * single command Peter runs to know "what's actually working today."
 *
 * USAGE
 *   node scripts/daily-funnel.mjs              # last 24h
 *   node scripts/daily-funnel.mjs --hours 48   # last 48h
 *   node scripts/daily-funnel.mjs --hours 168  # 7 days
 *   node scripts/daily-funnel.mjs --by trade   # group by trade (default city)
 *   node scripts/daily-funnel.mjs --by variant
 *   node scripts/daily-funnel.mjs --by score   # bucket by buyer_score
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const argv = process.argv.slice(2)
const args = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const eq = a.indexOf('=')
  if (eq > 0) args[a.slice(2, eq)] = a.slice(eq + 1)
  else { const n = argv[i + 1]; if (n && !n.startsWith('--')) { args[a.slice(2)] = n; i++ } else args[a.slice(2)] = true }
}
const hours = parseInt(args.hours ?? '24', 10)
const groupBy = args.by ?? 'city'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

// Pull every lead touched in the window
const { data: leads } = await supabase
  .from('outreach_leads')
  .select(`
    id, business_name, city, trade, trade_normalized, status,
    pushed_at, updated_at, sent_at:updated_at,
    first_opened_at, last_opened_at, open_count, report_visit_at,
    call_attempted_at, call_outcome,
    text_response_at, trial_started_at, paid_at,
    buyer_score, copy_variant, subject_variant,
    campaign_id
  `)
  .or(`updated_at.gte.${sinceIso},first_opened_at.gte.${sinceIso},report_visit_at.gte.${sinceIso},paid_at.gte.${sinceIso}`)
  .limit(5000)

const SENT_STATUSES = new Set(['sent', 'positive_reply', 'objection', 'wrong_person', 'reply_other', 'unsubscribed'])

const rows = leads ?? []

// Aggregate
function bucketKey(l) {
  if (groupBy === 'trade') return l.trade_normalized || l.trade || 'unknown'
  if (groupBy === 'variant') return l.copy_variant || 'default'
  if (groupBy === 'score') {
    if (l.buyer_score == null) return 'unscored'
    if (l.buyer_score >= 9) return '9-10 priority'
    if (l.buyer_score >= 7) return '7-8 send'
    if (l.buyer_score >= 5) return '5-6 borderline'
    return '1-4 skip'
  }
  return l.city || 'unknown'
}

const agg = new Map()
for (const l of rows) {
  const k = bucketKey(l)
  if (!agg.has(k)) {
    agg.set(k, {
      sent: 0, opened: 0, visited: 0, replied: 0, hot: 0, trial: 0, paid: 0, bounced: 0,
    })
  }
  const a = agg.get(k)
  if (SENT_STATUSES.has(l.status)) a.sent++
  if (l.first_opened_at && new Date(l.first_opened_at) >= new Date(sinceIso)) a.opened++
  if (l.report_visit_at && new Date(l.report_visit_at) >= new Date(sinceIso)) a.visited++
  if (l.text_response_at && new Date(l.text_response_at) >= new Date(sinceIso)) a.replied++
  if (l.status === 'positive_reply') a.hot++
  if (l.trial_started_at && new Date(l.trial_started_at) >= new Date(sinceIso)) a.trial++
  if (l.paid_at && new Date(l.paid_at) >= new Date(sinceIso)) a.paid++
  if (l.status === 'bounced') a.bounced++
}

// Sort by sent desc
const sorted = [...agg.entries()].sort((a, b) => b[1].sent - a[1].sent)

const totals = { sent: 0, opened: 0, visited: 0, replied: 0, hot: 0, trial: 0, paid: 0, bounced: 0 }
for (const [, v] of sorted) for (const k of Object.keys(totals)) totals[k] += v[k]

console.log(`\n📊 BellAveGo Funnel — last ${hours}h — grouped by ${groupBy}\n`)

const headers = [groupBy, 'sent', 'opened', '%open', 'visited', '%vis', 'replied', '%rep', 'hot', 'trial', 'paid', 'bounce', '%bnc']
const pct = (n, d) => d ? `${((n / d) * 100).toFixed(1)}%` : '—'

function pad(s, w) { return String(s).padEnd(w) }
const widths = [16, 6, 7, 6, 8, 6, 8, 6, 5, 6, 5, 7, 6]
console.log(headers.map((h, i) => pad(h, widths[i])).join('│ '))
console.log('─'.repeat(widths.reduce((a, b) => a + b + 2, 0)))

for (const [k, v] of sorted) {
  console.log([
    pad(k, widths[0]),
    pad(v.sent, widths[1]),
    pad(v.opened, widths[2]),
    pad(pct(v.opened, v.sent), widths[3]),
    pad(v.visited, widths[4]),
    pad(pct(v.visited, v.sent), widths[5]),
    pad(v.replied, widths[6]),
    pad(pct(v.replied, v.sent), widths[7]),
    pad(v.hot, widths[8]),
    pad(v.trial, widths[9]),
    pad(v.paid, widths[10]),
    pad(v.bounced, widths[11]),
    pad(pct(v.bounced, v.sent), widths[12]),
  ].join('│ '))
}

console.log('─'.repeat(widths.reduce((a, b) => a + b + 2, 0)))
console.log([
  pad('TOTAL', widths[0]),
  pad(totals.sent, widths[1]),
  pad(totals.opened, widths[2]),
  pad(pct(totals.opened, totals.sent), widths[3]),
  pad(totals.visited, widths[4]),
  pad(pct(totals.visited, totals.sent), widths[5]),
  pad(totals.replied, widths[6]),
  pad(pct(totals.replied, totals.sent), widths[7]),
  pad(totals.hot, widths[8]),
  pad(totals.trial, widths[9]),
  pad(totals.paid, widths[10]),
  pad(totals.bounced, widths[11]),
  pad(pct(totals.bounced, totals.sent), widths[12]),
].join('│ '))

console.log(`\nLegend: sent → opened → visited (clicked report) → replied → hot → trial → paid`)
console.log(`Bounce rate target: <2%. If >5%, pause sends and verify with Hunter.`)
console.log(`If replied%/sent <0.5% over 3 days, rotate copy variants.\n`)

// Call outcomes
const { data: callsToday } = await supabase
  .from('outreach_calls')
  .select('outcome, hot_lead')
  .gte('initiated_at', sinceIso)

const callBuckets = {}
let hotCount = 0
for (const c of callsToday ?? []) {
  callBuckets[c.outcome] = (callBuckets[c.outcome] ?? 0) + 1
  if (c.hot_lead) hotCount++
}
if (callsToday && callsToday.length > 0) {
  console.log(`📞 Warm calls last ${hours}h: ${callsToday.length} total, ${hotCount} hot leads → SMS Peter`)
  for (const [k, v] of Object.entries(callBuckets).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${k.padEnd(20)} ${v}`)
  }
} else {
  console.log(`📞 Warm calls last ${hours}h: 0 (warm caller TCPA-gated, awaiting consent flow)`)
}

console.log()
