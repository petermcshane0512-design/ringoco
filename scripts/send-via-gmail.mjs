#!/usr/bin/env node
/**
 * send-via-gmail.mjs — fully automated cold-email send via Gmail API.
 *
 * Reads the Instantly-shape CSV produced by run-cold-email-pipeline.mjs
 * and fires each row as a personalized email from bellavegollc@gmail.com.
 *
 * Behavior:
 *   - Throttled: ~60-120 sec between sends (jitter) so it looks human
 *   - After each successful send, marks outreach_leads.status='sent' (if lead_id present)
 *   - Logs each send to outreach_sends table for audit (id, email, subject, sent_at)
 *   - --dry-run prints what WOULD send without hitting Gmail
 *   - --test sends one email to GMAIL_SEND_FROM (yourself) — sanity check
 *
 * USAGE
 *   node scripts/send-via-gmail.mjs --csv leads/today-batch-instantly.csv [--limit 50] [--throttle 90] [--dry-run] [--test]
 *
 * ENV
 *   GMAIL_OAUTH_CLIENT_ID
 *   GMAIL_OAUTH_CLIENT_SECRET
 *   GMAIL_OAUTH_REFRESH_TOKEN
 *   GMAIL_SEND_FROM (default bellavegollc@gmail.com)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (for status updates)
 */

import fs from 'node:fs'
import { parse } from 'csv-parse/sync'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const args = parseArgs(process.argv.slice(2))
const csvPath = args.csv
const limit = parseInt(args.limit ?? '50', 10)
const throttleSec = parseInt(args.throttle ?? '90', 10)
const dryRun = args['dry-run'] === true || args['dry-run'] === 'true'
const testMode = args.test === true || args.test === 'true'

const {
  GMAIL_OAUTH_CLIENT_ID,
  GMAIL_OAUTH_CLIENT_SECRET,
  GMAIL_OAUTH_REFRESH_TOKEN,
  GMAIL_SEND_FROM = 'bellavegollc@gmail.com',
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env

if (!GMAIL_OAUTH_CLIENT_ID || !GMAIL_OAUTH_CLIENT_SECRET || !GMAIL_OAUTH_REFRESH_TOKEN) {
  console.error('FATAL: Gmail OAuth env missing. Run scripts/get-gmail-token.mjs first.')
  process.exit(1)
}

const oauth2 = new google.auth.OAuth2(GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET)
oauth2.setCredentials({ refresh_token: GMAIL_OAUTH_REFRESH_TOKEN })
const gmail = google.gmail({ version: 'v1', auth: oauth2 })

const supabase = NEXT_PUBLIC_SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null

// ── Test mode: send one email to self ──────────────────────────
if (testMode) {
  console.log(`🧪 Test mode — sending to ${GMAIL_SEND_FROM}`)
  await sendOne({
    to: GMAIL_SEND_FROM,
    subject: 'BellAveGo test send — Gmail API wired',
    body: 'If you see this in your inbox, the Gmail API is sending correctly from bellavegollc@gmail.com.\n\nNext step: scripts/send-via-gmail.mjs --csv <batch>.csv\n\n— Jarvis',
  })
  console.log('✅ Test email sent. Check inbox.')
  process.exit(0)
}

if (!csvPath || !fs.existsSync(csvPath)) {
  console.error('Usage: node scripts/send-via-gmail.mjs --csv <path> [--limit 50] [--throttle 90] [--dry-run]')
  process.exit(1)
}

// ── Read leads + filter ────────────────────────────────────────
const rows = parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true, trim: true })
// Required fields, dedup by email (avoids 3 sends to same address from
// duplicate CSV rows), and drop ONLY the exact fallback-data pattern
// (47 reviews + Northern Air Mechanical) since that's verbatim sample data
// that would look fake to every recipient.
const seenEmails = new Set()
const sendable = rows
  .filter((r) => r.email && r.subject_line)
  .filter((r) => !(r.your_reviews === '47' && r.top_competitor_name === 'Northern Air Mechanical'))
  .filter((r) => {
    const e = r.email.toLowerCase().trim()
    if (seenEmails.has(e)) return false
    seenEmails.add(e)
    return true
  })
  .slice(0, limit)
console.log(`📂 ${rows.length} rows · ${sendable.length} sendable (capped at --limit ${limit})`)

if (sendable.length === 0) {
  console.error('No sendable rows. Each row needs `email` and `subject_line` columns.')
  process.exit(1)
}

if (dryRun) {
  console.log('\n🧪 DRY RUN — emails NOT sent. Here\'s what would go:\n')
  for (const r of sendable.slice(0, 3)) {
    console.log(`  ✉ ${r.email}  |  ${r.subject_line}`)
  }
  if (sendable.length > 3) console.log(`  ... and ${sendable.length - 3} more`)
  process.exit(0)
}

// ── Real send loop ─────────────────────────────────────────────
let sent = 0
let errors = 0
const errorSamples = []

for (const r of sendable) {
  const body = renderBody(r)
  try {
    await sendOne({ to: r.email, subject: r.subject_line, body })
    sent++
    console.log(`  ✅ [${sent}/${sendable.length}] ${r.email}`)

    // Mark in DB
    if (supabase && r.lead_id) {
      await supabase
        .from('outreach_leads')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', r.lead_id)
        .then(({ error }) => {
          if (error) console.warn(`     ⚠ DB update failed: ${error.message}`)
        })
    }
  } catch (e) {
    errors++
    const msg = String(e).slice(0, 200)
    if (errorSamples.length < 5) errorSamples.push({ email: r.email, error: msg })
    console.warn(`  ❌ [${sent + errors}/${sendable.length}] ${r.email}: ${msg}`)
  }

  // Throttle between sends — last iteration skips wait
  if (sent + errors < sendable.length) {
    const jitter = throttleSec + Math.floor((Math.random() - 0.5) * throttleSec * 0.5)
    await sleep(jitter * 1000)
  }
}

console.log(`\n════════════════════════════════════════════════════════════════`)
console.log('DONE')
console.log(`════════════════════════════════════════════════════════════════`)
console.log(`Sent:   ${sent}`)
console.log(`Errors: ${errors}`)
if (errorSamples.length > 0) {
  console.log('\nFirst errors:')
  for (const s of errorSamples) console.log(`  - ${s.email}: ${s.error}`)
}

// ── Helpers ────────────────────────────────────────────────────

async function sendOne({ to, subject, body }) {
  // Build RFC 2822 plain-text email. UTF-8 subject encoded so emojis/em-dashes
  // don't get mangled. Body is plain text (no HTML for now — keeps spam score low).
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
  const lines = [
    `From: Peter @ BellAveGo <${GMAIL_SEND_FROM}>`,
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

function renderBody(r) {
  // Plain-text body, fully rendered. Three real per-business signals — rank,
  // top competitor gap, top opportunity dollar — then a link to the full
  // report. Skips the truncation-prone pattern text + the (currently fake)
  // Census addressable-market line. The unique numbers carry the email.
  const firstName = firstNameFromLead(r)
  return [
    `Hey ${firstName},`,
    '',
    `Pulled a quick revenue intel report on ${r.company_name} this morning — ${r.city} ${r.state} HVAC market.`,
    '',
    'Three things stood out:',
    '',
    `→ You're ranked #${r.your_rank} of ${r.total_competitors} HVAC shops with ${r.your_rating}★ and ${r.your_reviews} reviews. Market average is ${r.market_avg_reviews} reviews. ${r.top_competitor_name} sits at ${r.top_competitor_reviews}.`,
    '',
    `→ Top opportunity for ${r.company_name}: "${r.top_opp_title}" — modeled at +$${r.top_opp_monthly}/mo. Full pattern + 5-step action plan inside the report.`,
    '',
    `→ Competitive table inside shows where you sit vs the 5 nearest shops by review volume + rating.`,
    '',
    `Full personalized report (no signup, 2 min):`,
    r.report_url,
    '',
    `We're BellAveGo — AI receptionist for HVAC shops. Built this report because most shops your size lose 2-3 jobs/week to missed calls when techs are out. We answer those calls, capture the lead, text it to you in 10 seconds. 7-day free trial, $147/mo.`,
    '',
    `— Peter`,
    `BellAveGo · (773) 710-9565`,
    '',
    `P.S. The report has a 5-step action plan ranked by ROI. Step 1 usually adds $1,800/mo within 30 days for shops your size.`,
  ].join('\n')
}

// Guess a personable first name from the recipient. Order:
//   1. Explicit first_name column (skip if blank / "there")
//   2. Email local-part if it looks like a real first name (tom.x → Tom, kevin@ → Kevin)
//   3. "team" for generic mailboxes (info@, sales@) OR when the local-part
//      looks like the business name itself (justairac@ for "Just Air LLC")
function firstNameFromLead(r) {
  const explicit = (r.first_name || '').trim()
  if (explicit && explicit.toLowerCase() !== 'there' && explicit.length > 1 && explicit.length < 20) {
    return explicit.charAt(0).toUpperCase() + explicit.slice(1).toLowerCase()
  }
  const local = (r.email || '').split('@')[0].toLowerCase()
  const generics = new Set([
    'info', 'sales', 'service', 'office', 'contact', 'admin', 'hello',
    'support', 'mail', 'team', 'help', 'inquiry', 'inquiries', 'customerservice',
    'customer.service', 'frontdesk', 'reception', 'dispatch', 'estimates',
  ])
  if (generics.has(local)) return 'team'

  // If the local-part begins with the same 4+ chars as the business name, it's
  // a branded mailbox (justairac@... for "Just Air LLC"), not a person.
  const company = (r.company_name || '').toLowerCase().replace(/[^a-z]/g, '')
  if (company.length >= 4 && local.startsWith(company.slice(0, 4))) return 'team'

  // First segment of "firstname.lastname" / "firstname_lastname".
  const first = local.split(/[.\-_+0-9]/)[0]
  if (first.length >= 2 && first.length <= 14 && /^[a-z]+$/.test(first) && !generics.has(first)) {
    // Also drop if the first-segment IS a chunk of the company name.
    if (company.length >= 4 && (company.startsWith(first) || first.startsWith(company.slice(0, 4)))) {
      return 'team'
    }
    return first.charAt(0).toUpperCase() + first.slice(1)
  }
  return 'team'
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
