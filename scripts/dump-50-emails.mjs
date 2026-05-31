#!/usr/bin/env node
/**
 * dump-50-emails.mjs — non-interactive flat dump.
 *
 * Pulls 50 queued small dogs + cached reports, writes TO/SUBJECT/BODY
 * for each into a single text file Peter can scroll through and copy
 * one at a time into Gmail.
 *
 * Does NOT mark anything sent. Use scripts/mark-sent.mjs after batch
 * to flip statuses, or run scripts/mark-sent-from-log.mjs to scan
 * Gmail Sent folder and update DB automatically.
 *
 * USAGE
 *   node scripts/dump-50-emails.mjs [--limit 50]
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

// Parse --flag value AND --flag=value forms.
const argv = process.argv.slice(2)
const args = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const eq = a.indexOf('=')
  if (eq > 0) {
    args[a.slice(2, eq)] = a.slice(eq + 1)
  } else {
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { args[a.slice(2)] = next; i++ }
    else args[a.slice(2)] = true
  }
}
const limit = parseInt(args.limit ?? '50', 10)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const PLACEHOLDER_EMAILS = [
  'example.com', 'example.org', 'example.net', 'domain.com', 'yourcompany.com',
  '@email.com', // generic catch-all, caught fake testimonials 2026-05-29
  'your@', 'youremail@', 'name@', 'email@', 'test@', 'demo@', 'sample@',
  'noreply@', 'no-reply@', 'donotreply', 'bobsrepair.com', 'impallari@',
]
const isPlaceholder = (e) => {
  if (!e) return true
  const low = e.toLowerCase()
  if (PLACEHOLDER_EMAILS.some((p) => low.includes(p))) return true
  const local = low.split('@')[0]
  if (/^\d+$/.test(local)) return true
  if (local.length > 30) return true
  return false
}

const { data: rawLeads, error } = await supabase
  .from('outreach_leads')
  .select('id, email, business_name, owner_first_name, city, trade, campaign_id')
  .eq('status', 'queued')
  .not('email', 'is', null)
  .order('pushed_at', { ascending: true })
  .limit(limit * 2)

if (error) {
  console.error('FATAL:', error.message)
  process.exit(1)
}

console.log(`🔍 raw rows from DB: ${rawLeads?.length ?? 0}`)
if (rawLeads?.length) console.log(`   first: ${rawLeads[0].business_name} / ${rawLeads[0].email} / status=${rawLeads[0].status ?? '?'}`)
const filtered = (rawLeads ?? []).filter((l) => !isPlaceholder(l.email))
console.log(`🔍 after isPlaceholder filter: ${filtered.length}`)
const leads = filtered.slice(0, limit)
console.log(`📬 ${leads.length} small dogs pulled`)

const outLines = []
let withReport = 0
let withoutReport = 0
const noReportNames = []

for (let i = 0; i < leads.length; i++) {
  const l = leads[i]
  const { data: rpt } = await supabase
    .from('sample_reports')
    .select('business_name, zip, city, report')
    .ilike('business_name', l.business_name ?? '')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!rpt?.report) {
    withoutReport++
    noReportNames.push(`${l.business_name} (${l.email})`)
    continue
  }
  withReport++

  const c = rpt.report.competitive ?? {}
  const subject = `${rpt.business_name} — ${rpt.city ?? l.city ?? ''} ${l.trade ?? 'HVAC'} market intel (${c.yourReviewCount ?? 0} reviews vs ${c.marketAvgReviewCount ?? 0} avg)`
  const body = renderBody({
    first_name: firstNameFromLead(l),
    company_name: rpt.business_name,
    city: rpt.city ?? l.city ?? '',
    state: '',
    report: rpt.report,
    report_url: `https://www.bellavego.com/sample-report?for=${encodeURIComponent(rpt.business_name)}&zip=${encodeURIComponent(rpt.zip ?? '')}&type=${encodeURIComponent(l.trade ?? 'HVAC')}&city=${encodeURIComponent(rpt.city ?? '')}`,
  })

  outLines.push('═══════════════════════════════════════════════════════════════════')
  outLines.push(`  [${withReport}/${limit}]   ${l.business_name}   (${l.city ?? '?'})`)
  outLines.push(`  lead_id: ${l.id}`)
  outLines.push('═══════════════════════════════════════════════════════════════════')
  outLines.push('')
  outLines.push('──── TO ────')
  outLines.push(l.email)
  outLines.push('')
  outLines.push('──── SUBJECT ────')
  outLines.push(subject)
  outLines.push('')
  outLines.push('──── BODY ────')
  outLines.push(body)
  outLines.push('')
  outLines.push('')
}

const outPath = 'C:\\Users\\peter\\ringoco\\leads\\today-50-paste-pack.txt'
fs.writeFileSync(outPath, outLines.join('\n'), 'utf8')

console.log(`\n✅ Wrote ${withReport} ready-to-send emails`)
console.log(`📁 ${outPath}`)
console.log(`\n⏭  Skipped ${withoutReport} (no cached report):`)
for (const n of noReportNames.slice(0, 10)) console.log(`     - ${n}`)
if (noReportNames.length > 10) console.log(`     ... +${noReportNames.length - 10} more`)
console.log(`\nOpen with:`)
console.log(`  notepad ${outPath}`)
console.log(`\nAfter you've sent them in Gmail, mark them all sent:`)
console.log(`  node scripts/mark-sent-from-log.mjs --hours 24`)

function firstNameFromLead(l) {
  const explicit = (l.owner_first_name || '').trim()
  if (explicit && explicit.toLowerCase() !== 'there' && explicit.length > 1 && explicit.length < 20) {
    return explicit.charAt(0).toUpperCase() + explicit.slice(1).toLowerCase()
  }
  const local = (l.email || '').split('@')[0].toLowerCase()
  const generics = new Set([
    'info', 'sales', 'service', 'office', 'contact', 'admin', 'hello',
    'support', 'mail', 'team', 'help', 'inquiry', 'inquiries', 'customerservice',
    'customer.service', 'frontdesk', 'reception', 'dispatch', 'estimates',
  ])
  if (generics.has(local)) return 'team'
  const company = (l.business_name || '').toLowerCase().replace(/[^a-z]/g, '')
  if (company.length >= 4 && local.startsWith(company.slice(0, 4))) return 'team'
  const first = local.split(/[.\-_+0-9]/)[0]
  if (first.length >= 2 && first.length <= 14 && /^[a-z]+$/.test(first) && !generics.has(first)) {
    if (company.length >= 4 && (company.startsWith(first) || first.startsWith(company.slice(0, 4)))) return 'team'
    return first.charAt(0).toUpperCase() + first.slice(1)
  }
  return 'team'
}

function renderBody(input) {
  const c = input.report.competitive ?? {}
  const o = (input.report.opportunities ?? [])[0] ?? {}
  const topComp = (c.competitors ?? [])[0] ?? {}
  return [
    `Hey ${input.first_name},`,
    '',
    `Pulled a quick revenue intel report on ${input.company_name} this morning — ${input.city} ${input.state} HVAC market.`,
    '',
    'Three things stood out:',
    '',
    `→ You're ranked #${c.yourRank ?? '?'} of ${c.totalCompetitors ?? '?'} HVAC shops with ${c.yourRating ?? '?'}★ and ${c.yourReviewCount ?? 0} reviews. Market average is ${c.marketAvgReviewCount ?? 0} reviews. ${topComp.name ?? 'Top competitor'} sits at ${topComp.reviewCount ?? 0}.`,
    '',
    `→ Top opportunity for ${input.company_name}: "${o.title ?? 'revenue gap'}" — modeled at +$${o.monthlyValue ?? 0}/mo. Full pattern + 5-step action plan inside the report.`,
    '',
    `→ Competitive table inside shows where you sit vs the 5 nearest shops by review volume + rating.`,
    '',
    `Full personalized report (no signup, 2 min):`,
    input.report_url,
    '',
    `We're BellAveGo — AI receptionist for HVAC shops that don't have one yet. You're probably answering your own phone between jobs right now, losing 2-3 jobs/week when you can't pick up. We answer those calls for you, capture the lead, text it to your phone in 10 seconds — so you can stay on the wrench AND book the job. 7-day free trial, $147/mo. No risk, cancel anytime.`,
    '',
    `— Peter`,
    `BellAveGo · (773) 710-9565`,
    '',
    `P.S. Want to set up your team's account? Text us at (773) 710-9565. We'll text back the moment we see it — no Zoom calls, no scheduling, just a conversation on your phone like everything else in your day.`,
  ].join('\n')
}
