#!/usr/bin/env node
/**
 * dump-rtf-pack.mjs — pull all remaining queued small dogs, render each
 * as a full cold email (TO/SUBJECT/BODY), write to an .rtf that Word
 * opens natively. Built 2026-05-29 after personal-Gmail send was paused
 * (Zoho recovery address risk). Peter wants a doc he can scroll/copy
 * from while moving the remaining sends to Instantly + Zoho burners.
 *
 * USAGE
 *   node scripts/dump-rtf-pack.mjs [--limit 200]
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
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
const limit = parseInt(args.limit ?? '200', 10)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const PLACEHOLDER_EMAILS = [
  'example.com', 'example.org', 'example.net', 'domain.com', 'yourcompany.com',
  '@email.com',
  'your@', 'youremail@', 'name@', 'email@', 'test@', 'demo@', 'sample@',
  'noreply@', 'no-reply@', 'donotreply', 'bobsrepair.com', 'impallari@',
]
const isPlaceholder = (e) => {
  if (!e) return true
  const low = e.toLowerCase()
  if (PLACEHOLDER_EMAILS.some((p) => low.includes(p))) return true
  const local = low.split('@')[0]
  if (/^\d+$/.test(local) || local.length > 30) return true
  // domain mismatch check: starts with % (URL-encoded junk)
  if (/^%[0-9a-f]{2}/i.test(low)) return true
  return false
}

const { data: rawLeads } = await supabase
  .from('outreach_leads')
  .select('id, email, business_name, owner_first_name, city, trade')
  .eq('status', 'queued')
  .not('email', 'is', null)
  .order('pushed_at', { ascending: true })
  .limit(limit * 2)

const leads = (rawLeads ?? []).filter((l) => !isPlaceholder(l.email)).slice(0, limit)
console.log(`📬 ${leads.length} valid queued leads`)

const blocks = []
let withReport = 0
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

  if (!rpt?.report) { noReport++; continue }
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

  blocks.push({ n: withReport, business: l.business_name, city: l.city ?? '?', email: l.email, subject, body })
}

// ── RTF generation ────────────────────────────────────────────────
const esc = (s) => String(s)
  .replace(/\\/g, '\\\\')
  .replace(/\{/g, '\\{')
  .replace(/\}/g, '\\}')
  .replace(/\n/g, '\\par\n')
  // Convert non-ASCII to \uNNNN? form for RTF
  .replace(/[-￿]/g, (ch) => `\\u${ch.charCodeAt(0)}?`)

const header = `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat{\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}}\n{\\colortbl ;\\red0\\green0\\blue0;\\red37\\green99\\blue235;\\red107\\green114\\blue128;}\n\\viewkind4\\uc1\\pard\\sa120\\sl276\\slmult1\\f0\\fs22\n`
const footer = `}`

const sections = blocks.map((b) => [
  `\\pard\\sb240\\sa60\\b\\fs26 EMAIL ${b.n} \\u8212? ${esc(b.business)} (${esc(b.city)})\\b0\\fs22\\par`,
  `\\pard\\sa60\\cf3\\b TO:\\cf1\\b0 ${esc(b.email)}\\par`,
  `\\pard\\sa60\\cf3\\b SUBJECT:\\cf1\\b0 ${esc(b.subject)}\\par`,
  `\\pard\\sa60\\cf3\\b BODY:\\cf1\\b0\\par`,
  `\\pard\\sa60 ${esc(b.body)}\\par`,
  `\\pard\\sb120\\sa120\\cf3\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\u9472?\\cf1\\par`,
].join('\n')).join('\n\n')

const outPath = 'C:\\Users\\peter\\ringoco\\leads\\today-remaining-paste-pack.rtf'
fs.writeFileSync(outPath, header + sections + footer, 'utf8')

console.log(`\n✅ Wrote ${withReport} ready-to-send emails to RTF (Word-native)`)
console.log(`📁 ${outPath}`)
console.log(`⏭  ${noReport} skipped (no cached report)`)
console.log(`\nOpen with:`)
console.log(`  start ${outPath}`)
console.log(`(or right-click → Open with → Microsoft Word)`)

function firstNameFromLead(l) {
  const explicit = (l.owner_first_name || '').trim()
  if (explicit && explicit.toLowerCase() !== 'there' && explicit.length > 1 && explicit.length < 20) {
    return explicit.charAt(0).toUpperCase() + explicit.slice(1).toLowerCase()
  }
  const local = (l.email || '').split('@')[0].toLowerCase()
  const generics = new Set(['info', 'sales', 'service', 'office', 'contact', 'admin', 'hello', 'support', 'mail', 'team', 'help', 'inquiry', 'inquiries', 'customerservice', 'customer.service', 'frontdesk', 'reception', 'dispatch', 'estimates'])
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
