#!/usr/bin/env node
/**
 * manual-send.mjs — human-in-the-loop cold send via Gmail web UI.
 *
 * Built 2026-05-29 because Peter wants to send today's 50 manually,
 * spread out throughout the day, to dodge the spam-burst pattern.
 *
 * Flow per lead:
 *   1. Pull next queued small-dog from DB + cached report
 *   2. Print a Gmail "compose" deep-link with to/subject/body pre-filled
 *   3. Peter clicks → Gmail opens populated → he hits SEND
 *   4. Peter presses ENTER in terminal → script marks DB sent + shows next
 *   5. Type "skip" → marks awaiting_report, moves on (doesn't burn the lead)
 *   6. Type "q" → quit, no more shown
 *
 * USAGE
 *   node scripts/manual-send.mjs [--limit 50]
 */

import { createClient } from '@supabase/supabase-js'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.+))?$/)
    return m ? [m[1], m[2] ?? true] : [a, true]
  }),
)
const limit = parseInt(args.limit ?? '50', 10)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: Supabase env missing')
  process.exit(1)
}
const GMAIL_SEND_FROM = process.env.GMAIL_SEND_FROM || 'petermcshane0512@gmail.com'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const PLACEHOLDER_EMAILS = [
  'example.com', 'example.org', 'example.net', 'domain.com', 'yourcompany.com',
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
  console.error('FATAL: pull error:', error.message)
  process.exit(1)
}

const leads = (rawLeads ?? []).filter((l) => !isPlaceholder(l.email)).slice(0, limit)
if (!leads.length) {
  console.log('📭 No queued small dogs. Run scrape.')
  process.exit(0)
}

console.log(`\n📬 ${leads.length} small dogs queued.\n`)
console.log(`Controls:`)
console.log(`  ENTER   — mark sent + next`)
console.log(`  s       — skip (no DB change, moves on)`)
console.log(`  q       — quit\n`)

const rl = readline.createInterface({ input: stdin, output: stdout })

let sent = 0
let skipped = 0
let noReport = 0

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
    await supabase.from('outreach_leads').update({ status: 'awaiting_report' }).eq('id', l.id)
    noReport++
    console.log(`[${i + 1}/${leads.length}] ⏭  ${l.business_name} — no cached report, skipped\n`)
    continue
  }

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

  console.log(`\n\n═══════════════════════════════════════════════════════════════════`)
  console.log(`  [${i + 1}/${leads.length}]   ${l.business_name}   (${l.city ?? '?'})`)
  console.log(`═══════════════════════════════════════════════════════════════════\n`)

  console.log(`──── TO ────`)
  console.log(l.email)

  console.log(`\n──── SUBJECT ────`)
  console.log(subject)

  console.log(`\n──── BODY ────`)
  console.log(body)
  console.log(`\n═══════════════════════════════════════════════════════════════════`)

  const answer = (await rl.question('   ↳ sent? [ENTER=yes / s=skip / q=quit]: ')).trim().toLowerCase()

  if (answer === 'q') {
    console.log(`\n🛑 Quit at ${i + 1}/${leads.length}.`)
    break
  }
  if (answer === 's') {
    skipped++
    console.log(`   ⏭  skipped, lead stays queued for next round\n`)
    continue
  }

  await supabase
    .from('outreach_leads')
    .update({ status: 'sent', updated_at: new Date().toISOString() })
    .eq('id', l.id)
  sent++
  console.log(`   ✅ marked sent in DB\n`)
}

rl.close()

console.log(`\n📊 SESSION DONE`)
console.log(`   ✅ Sent + marked:  ${sent}`)
console.log(`   ⏭  Skipped:        ${skipped}`)
console.log(`   📭 No report:      ${noReport}\n`)
console.log(`Re-run anytime: node scripts/manual-send.mjs --limit 10\n`)

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
