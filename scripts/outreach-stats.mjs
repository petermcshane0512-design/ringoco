#!/usr/bin/env node
/**
 * outreach-stats.mjs — full-funnel analytics on cold-email outreach.
 *
 * Joins data from:
 *   outreach_leads     → sends + status
 *   sample_reports     → report clicks (open_count, opened_at)
 *   outreach_replies   → classified replies (positive, objection, etc.)
 *   Gmail Sent folder  → thread-level reply detection
 *
 * USAGE
 *   node scripts/outreach-stats.mjs                      # today
 *   node scripts/outreach-stats.mjs --since 2026-05-27   # since date
 *   node scripts/outreach-stats.mjs --campaign az-gmail-soft-launch-2026-05-27
 *   node scripts/outreach-stats.mjs --details            # per-lead breakdown
 *
 * ENV
 *   GMAIL_OAUTH_* (same as send-via-gmail.mjs)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const args = parseArgs(process.argv.slice(2))
const since = args.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const campaignFilter = args.campaign || null
const details = args.details === true || args.details === 'true'

const {
  GMAIL_OAUTH_CLIENT_ID,
  GMAIL_OAUTH_CLIENT_SECRET,
  GMAIL_OAUTH_REFRESH_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const oauth2 = new google.auth.OAuth2(GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET)
oauth2.setCredentials({ refresh_token: GMAIL_OAUTH_REFRESH_TOKEN })
const gmail = google.gmail({ version: 'v1', auth: oauth2 })

console.log(`\n╔════════════════════════════════════════════════════════╗`)
console.log(`║ BellAveGo Outreach Analytics                            ║`)
console.log(`║ Since: ${since.padEnd(10)} ${campaignFilter ? '· ' + campaignFilter.slice(0, 32).padEnd(34) : '· (all campaigns)'.padEnd(36)} ║`)
console.log(`╚════════════════════════════════════════════════════════╝\n`)

// ── 1. Pull leads from outreach_leads ──────────────────────────
let q = supabase
  .from('outreach_leads')
  .select('id, email, business_name, owner_first_name, city, trade, campaign_id, status, pushed_at, updated_at')
  .gte('updated_at', `${since}T00:00:00Z`)
  .order('updated_at', { ascending: false })
if (campaignFilter) q = q.eq('campaign_id', campaignFilter)
const { data: leads, error: leadsErr } = await q
if (leadsErr) {
  console.error('Leads query failed:', leadsErr.message)
  process.exit(1)
}
console.log(`📋 ${leads.length} leads touched since ${since}`)

// ── 2. Aggregate by status ────────────────────────────────────
const statusCounts = {}
for (const l of leads) {
  statusCounts[l.status] = (statusCounts[l.status] || 0) + 1
}
console.log('\n🟢 Status breakdown:')
for (const [s, n] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${n.toString().padStart(4)}  ${s}`)
}

const sent = leads.filter((l) => ['sent', 'positive_reply', 'objection', 'wrong_person', 'auto_reply', 'bounced', 'dropped', 'hostile', 'spam', 'reply_other'].includes(l.status))
const sentCount = sent.length
console.log(`\n📤 Emails sent: ${sentCount}`)

// ── 3. Report clicks from sample_reports ───────────────────────
const emails = leads.map((l) => l.email).filter(Boolean)
let clicks = []
if (emails.length > 0) {
  const { data: c } = await supabase
    .from('sample_reports')
    .select('business_name, zip, lead_email, open_count, opened_at, last_opened_at, generated_at')
    .in('lead_email', emails)
  clicks = c ?? []
}

const opened = clicks.filter((c) => (c.open_count ?? 0) > 0)
const totalOpens = clicks.reduce((sum, c) => sum + (c.open_count ?? 0), 0)
const openRate = sentCount > 0 ? (opened.length / sentCount * 100).toFixed(1) : '0'
console.log(`\n👁  Reports opened: ${opened.length} of ${sentCount} (${openRate}% click-through)`)
console.log(`   Total opens (incl repeat views): ${totalOpens}`)
if (opened.length > 0) {
  const fastestOpen = opened.map((c) => new Date(c.opened_at) - new Date(c.generated_at)).filter((n) => n > 0).sort((a, b) => a - b)[0]
  if (fastestOpen) console.log(`   Fastest open after generation: ${Math.round(fastestOpen / 60000)} min`)
}

// ── 4. Replies from Gmail Sent folder ──────────────────────────
// Find threads we sent since `since` and count how many got a reply.
const gmailQuery = `from:me newer_than:${Math.max(1, Math.ceil((Date.now() - new Date(since).getTime()) / (24 * 60 * 60 * 1000)))}d`
const list = await gmail.users.messages.list({ userId: 'me', q: gmailQuery, maxResults: 200 })
const sentMsgIds = (list.data.messages ?? []).map((m) => m.id).filter(Boolean)

let threadsWithReply = 0
let threadsSampled = 0
const seenThreads = new Set()
for (const id of sentMsgIds.slice(0, 100)) {
  const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata' })
  const threadId = msg.data.threadId
  if (!threadId || seenThreads.has(threadId)) continue
  seenThreads.add(threadId)
  threadsSampled++
  const t = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'minimal' })
  if ((t.data.messages?.length ?? 0) > 1) threadsWithReply++
}

const replyRate = threadsSampled > 0 ? (threadsWithReply / threadsSampled * 100).toFixed(1) : '0'
console.log(`\n💬 Replies: ${threadsWithReply} of ${threadsSampled} sent threads (${replyRate}% reply rate)`)

// ── 5. Reply classifications from outreach_replies ─────────────
const { data: replies } = await supabase
  .from('outreach_replies')
  .select('lead_email, classification, summary, received_at')
  .gte('received_at', `${since}T00:00:00Z`)
  .order('received_at', { ascending: false })

if (replies && replies.length > 0) {
  const classBreakdown = {}
  for (const r of replies) classBreakdown[r.classification] = (classBreakdown[r.classification] || 0) + 1
  console.log(`\n🧠 Classified replies (${replies.length} total):`)
  for (const [c, n] of Object.entries(classBreakdown).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${n.toString().padStart(4)}  ${c}`)
  }
  const hot = replies.filter((r) => r.classification === 'positive_reply' || r.classification === 'interested')
  if (hot.length > 0) {
    console.log(`\n🔥 HOT REPLIES — respond to these first:`)
    for (const h of hot.slice(0, 5)) {
      console.log(`   - ${h.lead_email}`)
      console.log(`     "${(h.summary ?? '').slice(0, 100)}"`)
    }
  }
}

// ── 6. Per-lead details (optional) ─────────────────────────────
if (details) {
  console.log(`\n📊 Per-lead breakdown:`)
  for (const l of sent) {
    const click = clicks.find((c) => c.lead_email === l.email)
    const opens = click?.open_count ?? 0
    const lastOpened = click?.last_opened_at ? new Date(click.last_opened_at).toLocaleString() : '—'
    console.log(`   ${l.email.padEnd(40)} status=${l.status.padEnd(18)} opens=${opens.toString().padStart(2)} last_open=${lastOpened}`)
  }
}

console.log(`\n${'═'.repeat(60)}\n`)

// ── Funnel summary ─────────────────────────────────────────────
console.log(`Funnel summary:`)
console.log(`  Sent:           ${sentCount}`)
console.log(`  Opened report:  ${opened.length}  (${openRate}% click-through)`)
console.log(`  Replied:        ${threadsWithReply}  (${replyRate}% reply rate)`)
console.log(`  Bounced:        ${(statusCounts.bounced ?? 0)}`)
console.log(`  Unsubscribed:   ${(statusCounts.dropped ?? 0)}`)
console.log(`\n💡 Industry benchmarks:`)
console.log(`   open rate ${openRate}% (target 30-45%)`)
console.log(`   reply rate ${replyRate}% (target 2-4% real, 1-2% acceptable)\n`)

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
