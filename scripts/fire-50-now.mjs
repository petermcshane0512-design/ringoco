#!/usr/bin/env node
/**
 * fire-50-now.mjs — local mirror of /api/crons/daily-cold-send.
 *
 * Built 2026-05-29 because Vercel cron mis-scheduled (14 UTC = 10 AM ET
 * during DST, not 9 AM). Peter wants 50 sends NOW, not in 30 min.
 *
 * Identical pull/send/mark logic to the cron route. Reads from .env.local
 * so we don't need to pull the ADMIN_API_SECRET from Vercel.
 *
 * USAGE
 *   node scripts/fire-50-now.mjs [--limit 50] [--throttle 60] [--dry]
 */

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
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
const throttleSec = parseInt(args.throttle ?? '60', 10)
const dryRun = args.dry === true || args.dry === 'true'

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GMAIL_OAUTH_CLIENT_ID,
  GMAIL_OAUTH_CLIENT_SECRET,
  GMAIL_OAUTH_REFRESH_TOKEN,
  GMAIL_SEND_FROM = 'petermcshane0512@gmail.com',
} = process.env

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: Supabase env missing')
  process.exit(1)
}
if (!GMAIL_OAUTH_CLIENT_ID || !GMAIL_OAUTH_CLIENT_SECRET || !GMAIL_OAUTH_REFRESH_TOKEN) {
  console.error('FATAL: Gmail OAuth env missing')
  process.exit(1)
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const oauth2 = new google.auth.OAuth2(GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET)
oauth2.setCredentials({ refresh_token: GMAIL_OAUTH_REFRESH_TOKEN })
const gmail = google.gmail({ version: 'v1', auth: oauth2 })

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

const { data: rawLeads, error: pullErr } = await supabase
  .from('outreach_leads')
  .select('id, email, business_name, owner_first_name, city, trade, campaign_id')
  .eq('status', 'queued')
  .not('email', 'is', null)
  .order('pushed_at', { ascending: true })
  .limit(limit * 2)

if (pullErr) {
  console.error('FATAL: pull error:', pullErr.message)
  process.exit(1)
}

const leads = (rawLeads ?? []).filter((l) => !isPlaceholder(l.email)).slice(0, limit)
const placeholderIds = (rawLeads ?? []).filter((l) => isPlaceholder(l.email)).map((l) => l.id)

if (placeholderIds.length > 0) {
  await supabase.from('outreach_leads').update({ status: 'invalid_email' }).in('id', placeholderIds)
  console.log(`🗑  Marked ${placeholderIds.length} placeholder emails as invalid_email`)
}

if (!leads.length) {
  console.log('📭 Queue empty — nothing to send')
  process.exit(0)
}

console.log(`📤 Pulled ${leads.length} queued small dogs (throttle ${throttleSec}s)`)
console.log(`   First 3: ${leads.slice(0, 3).map((l) => `${l.business_name} (${l.email})`).join(', ')}`)

if (dryRun) {
  console.log('🧪 DRY RUN — exiting without send')
  process.exit(0)
}

// Atomically claim
const claimedIds = leads.map((l) => l.id)
await supabase
  .from('outreach_leads')
  .update({ status: 'sending', updated_at: new Date().toISOString() })
  .in('id', claimedIds)
console.log(`🔒 Claimed ${claimedIds.length} leads (status=sending)`)

let sent = 0
let errors = 0
let noReport = 0
const errorSamples = []

for (let i = 0; i < leads.length; i++) {
  const l = leads[i]
  const tag = `[${i + 1}/${leads.length}]`

  const { data: rpt } = await supabase
    .from('sample_reports')
    .select('business_name, zip, city, report, token')
    .ilike('business_name', l.business_name ?? '')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!rpt?.report) {
    await supabase.from('outreach_leads').update({ status: 'awaiting_report' }).eq('id', l.id)
    noReport++
    console.log(`${tag} ⏭  ${l.business_name} — no cached report, skipped`)
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

  try {
    await sendOne({ to: l.email, subject, body })
    sent++
    await supabase
      .from('outreach_leads')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', l.id)
    console.log(`${tag} ✅ ${l.business_name} → ${l.email}`)
  } catch (e) {
    errors++
    await supabase
      .from('outreach_leads')
      .update({ status: 'send_failed', updated_at: new Date().toISOString() })
      .eq('id', l.id)
    const msg = e instanceof Error ? e.message : String(e)
    if (errorSamples.length < 5) errorSamples.push({ email: l.email, error: msg.slice(0, 200) })
    console.log(`${tag} ❌ ${l.business_name} → ${l.email} | ${msg.slice(0, 80)}`)
  }

  if (i < leads.length - 1) {
    const jitter = throttleSec + Math.floor((Math.random() - 0.5) * throttleSec * 0.5)
    process.stdout.write(`   ⏲  sleeping ${jitter}s...\r`)
    await new Promise((r) => setTimeout(r, jitter * 1000))
    process.stdout.write('                              \r')
  }
}

console.log(`\n📊 DONE`)
console.log(`   ✅ Sent:           ${sent}`)
console.log(`   ⏭  No report:      ${noReport}`)
console.log(`   ❌ Errors:         ${errors}`)
if (errorSamples.length > 0) {
  console.log(`\n   Error samples:`)
  for (const e of errorSamples) console.log(`     - ${e.email}: ${e.error}`)
}

async function sendOne({ to, subject, body }) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
  const lines = [
    `From: Peter McShane <${GMAIL_SEND_FROM}>`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    body,
  ]
  const raw = Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}

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
