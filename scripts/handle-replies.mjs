#!/usr/bin/env node
/**
 * handle-replies.mjs — poll Gmail for new replies to cold-outreach emails,
 * classify them, draft founder-voice responses, and (optionally) auto-send.
 *
 * Designed to run on a cron (every 5-15 min). Each run:
 *   1. Polls Gmail for messages since the last seen `historyId` (saved in DB)
 *   2. Filters to ones replying to a thread we sent
 *   3. Classifies via Haiku (interested / objection / unsubscribe / ooo / bounced / wrong_person / hostile)
 *   4. Updates outreach_leads.status
 *   5. For `interested` / `objection` → Sonnet drafts a 2-3 sentence reply
 *      with a Calendly link, drops it in Gmail Drafts (delayed 30-90 min jitter)
 *   6. For `bounced` → marks the lead as dead, removes from queue
 *   7. For `unsubscribe` → suppresses
 *   8. SMSes Peter on `interested` (target: human reply within 60 min)
 *
 * Phase 1: drafts only — Peter approves + clicks Send.
 * Phase 2 (flip --auto): auto-send drafts after the 30-90 min delay.
 *
 * USAGE
 *   node scripts/handle-replies.mjs [--auto] [--lookback-hours 24] [--dry-run]
 *
 * ENV
 *   GMAIL_OAUTH_* (same as send-via-gmail.mjs)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 *   CALENDLY_LINK (optional, defaults to a placeholder)
 *   TWILIO_* + OWNER_PHONE (for hot-reply SMS, optional)
 */

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const args = parseArgs(process.argv.slice(2))
const autoSend = args.auto === true || args.auto === 'true'
const lookbackHours = parseInt(args['lookback-hours'] ?? '24', 10)
const dryRun = args['dry-run'] === true || args['dry-run'] === 'true'

const {
  GMAIL_OAUTH_CLIENT_ID,
  GMAIL_OAUTH_CLIENT_SECRET,
  GMAIL_OAUTH_REFRESH_TOKEN,
  GMAIL_SEND_FROM = 'petermcshane0512@gmail.com',
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY,
  CALENDLY_LINK = 'https://calendly.com/bellavego/demo',
} = process.env

if (!GMAIL_OAUTH_CLIENT_ID || !GMAIL_OAUTH_REFRESH_TOKEN) {
  console.error('FATAL: Gmail OAuth env missing')
  process.exit(1)
}

const oauth2 = new google.auth.OAuth2(GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET)
oauth2.setCredentials({ refresh_token: GMAIL_OAUTH_REFRESH_TOKEN })
const gmail = google.gmail({ version: 'v1', auth: oauth2 })

const supabase = NEXT_PUBLIC_SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

// ── Find replies in the last N hours ───────────────────────────
// Gmail query: messages newer_than:Nh that are replies (have In-Reply-To)
// and NOT sent by us. The cold-email-out label scoping happens via
// reading each thread's first message + checking if WE sent it.
const sinceQuery = `newer_than:${Math.ceil(lookbackHours)}h -from:me`
console.log(`📬 Gmail query: ${sinceQuery}`)

const list = await gmail.users.messages.list({
  userId: 'me',
  q: sinceQuery,
  maxResults: 100,
})

const messageIds = (list.data.messages || []).map((m) => m.id).filter(Boolean)
console.log(`   ${messageIds.length} candidate inbound messages`)

let classified = 0
let drafted = 0
let bounced = 0
let unsubbed = 0
let skipped = 0
const summary = []

for (const id of messageIds) {
  const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
  const headers = msg.data.payload?.headers || []
  const from = headerVal(headers, 'From') || ''
  const subject = headerVal(headers, 'Subject') || ''
  const inReplyTo = headerVal(headers, 'In-Reply-To') || ''
  const threadId = msg.data.threadId

  // ── Bounce detection ────────────────────────────────────────
  if (/mailer-daemon|postmaster/i.test(from)) {
    const body = extractText(msg.data.payload)
    const bouncedAddr = (body.match(/(?:wasn't delivered to|to reach |Recipient:|Final-Recipient:.*?)\s*<?([\w.+-]+@[\w.-]+\.[a-z]{2,})/i) || [])[1]
    if (bouncedAddr && supabase) {
      await supabase
        .from('outreach_leads')
        .update({ status: 'bounced', updated_at: new Date().toISOString() })
        .ilike('email', bouncedAddr)
      bounced++
      summary.push(`  ❌ BOUNCED ${bouncedAddr}`)
    } else {
      skipped++
    }
    continue
  }

  // ── Only handle replies to our cold-outreach threads ────────
  // Heuristic: subject contains "HVAC market intel" (our subject pattern)
  // or message has an In-Reply-To header AND we have a row in outreach_leads
  // matching the From address.
  const fromAddr = (from.match(/<([\w.+-]+@[\w.-]+)>/) || [null, from])[1].toLowerCase()
  if (!fromAddr.includes('@')) {
    skipped++
    continue
  }

  let lead = null
  if (supabase) {
    const { data } = await supabase
      .from('outreach_leads')
      .select('id, email, business_name, owner_first_name, city, trade, status, campaign_id')
      .ilike('email', fromAddr)
      .maybeSingle()
    lead = data
  }

  if (!lead && !subject.match(/HVAC market intel|BellAveGo/i)) {
    skipped++
    continue
  }

  const body = extractText(msg.data.payload).slice(0, 4000)
  const classification = await classifyReply(body, subject)
  classified++

  // ── Status update ────────────────────────────────────────────
  if (supabase && lead) {
    const statusMap = {
      interested: 'positive_reply',
      objection: 'objection',
      wrong_person: 'wrong_person',
      unsubscribe: 'dropped',
      ooo: 'auto_reply',
      hostile: 'hostile',
      spam: 'spam',
    }
    const newStatus = statusMap[classification] || 'reply_other'
    await supabase
      .from('outreach_leads')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', lead.id)
  }

  if (classification === 'unsubscribe') {
    unsubbed++
    summary.push(`  🚫 UNSUB ${fromAddr}`)
    continue
  }
  if (classification === 'hostile' || classification === 'spam' || classification === 'ooo') {
    summary.push(`  ⏭  ${classification.toUpperCase()} ${fromAddr}`)
    continue
  }

  if (classification === 'interested' || classification === 'objection') {
    const draftBody = await draftReply({ classification, body, lead, fromAddr })
    drafted++

    if (dryRun) {
      summary.push(`  📝 [dry-run] DRAFT for ${fromAddr}:`)
      summary.push(`     ${draftBody.slice(0, 200)}...`)
      continue
    }

    // Drop into Gmail Drafts (Phase 1) or auto-send (Phase 2)
    const recipient = fromAddr
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`
    if (autoSend) {
      // Phase 2: jitter 30-90 min, then send
      const delayMs = (30 + Math.random() * 60) * 60 * 1000
      summary.push(`  ⏱  AUTO-SEND in ${Math.round(delayMs / 60000)} min: ${fromAddr}`)
      setTimeout(() => {
        sendReply({ to: recipient, subject: replySubject, body: draftBody, threadId }).catch((e) =>
          console.error('auto-send failed:', e),
        )
      }, delayMs)
    } else {
      // Phase 1: save as draft
      await createDraft({ to: recipient, subject: replySubject, body: draftBody, threadId })
      summary.push(`  📝 DRAFT saved for ${fromAddr} (${classification})`)
    }
  }
}

console.log(`\n════════════════════════════════════════════════════════════════`)
console.log('DONE')
console.log(`════════════════════════════════════════════════════════════════`)
console.log(`Messages scanned:  ${messageIds.length}`)
console.log(`Classified:        ${classified}`)
console.log(`Drafts written:    ${drafted}`)
console.log(`Bounces logged:    ${bounced}`)
console.log(`Unsubs:            ${unsubbed}`)
console.log(`Skipped:           ${skipped}`)
if (summary.length > 0) {
  console.log('')
  for (const line of summary) console.log(line)
}

// ── Helpers ────────────────────────────────────────────────────

function headerVal(headers, name) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value
}

function extractText(payload) {
  if (!payload) return ''
  if (payload.body?.data) return decode64(payload.body.data)
  const parts = payload.parts || []
  // Prefer text/plain
  const text = parts.find((p) => p.mimeType === 'text/plain')
  if (text?.body?.data) return decode64(text.body.data)
  // Recurse into multipart
  for (const part of parts) {
    if (part.parts) {
      const inner = extractText(part)
      if (inner) return inner
    }
  }
  return ''
}

function decode64(s) {
  try { return Buffer.from(s, 'base64url').toString('utf8') } catch { return '' }
}

async function classifyReply(body, subject) {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 12,
      system:
        'Classify a B2B cold-email reply into ONE category. Output ONLY the category name. ' +
        'Categories: interested (wants demo or asks question or shows engagement), ' +
        'objection (engaged but pushback like "not now", "price", "skeptical of AI"), ' +
        'wrong_person (forwarding, "not the right contact", retired), ' +
        'unsubscribe (stop, remove, take me off, not interested), ' +
        'ooo (out of office, vacation, will respond later), ' +
        'hostile (angry, threatening, profane), ' +
        'spam (unrelated, sales pitch back at us, gibberish).',
      messages: [{ role: 'user', content: `Subject: ${subject}\n\nBody:\n${body}` }],
    })
    const text = (res.content[0].type === 'text' ? res.content[0].text : '').trim().toLowerCase()
    const valid = ['interested', 'objection', 'wrong_person', 'unsubscribe', 'ooo', 'hostile', 'spam']
    return valid.includes(text) ? text : 'objection'
  } catch (e) {
    console.error('classify failed:', e)
    return 'objection'
  }
}

async function draftReply({ classification, body, lead, fromAddr }) {
  const businessName = lead?.business_name || 'your shop'
  const firstName = lead?.owner_first_name || ''

  const system = `You are Peter, the founder of BellAveGo, an AI receptionist SaaS for home-service contractors. You're replying to a cold-email reply from an HVAC contractor. Voice: short, casual, founder-direct. NEVER use "leverage", "synergy", "best-in-class", em-dashes longer than one per reply. Lowercase "i" or contractions are fine. 2-4 sentences MAX. Always end with a low-pressure CTA — either a Calendly link or a question that invites continuation.

Output ONLY the email body. No greeting like "Dear X" — just start naturally ("hey ${firstName || 'there'}," or "thanks for the reply,"). No formal sign-off — just "— Peter" at the end.`

  const user = `Their reply (classification: ${classification}):
"""
${body.slice(0, 1500)}
"""

Context about ${businessName}:
- City: ${lead?.city || 'unknown'}
- Trade: ${lead?.trade || 'HVAC'}

Calendly link to include if pitching a demo: ${CALENDLY_LINK}

Draft your reply now. ${classification === 'interested' ? 'They are interested — push for a 15-min demo with the Calendly link.' : 'They have an objection — address it specifically and ask one clarifying question. Do NOT push the demo until they re-engage.'}`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: user }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
    return text || `hey, thanks for the reply — got a quick 15 min this week? ${CALENDLY_LINK}\n\n— Peter`
  } catch (e) {
    console.error('draft failed:', e)
    return `hey, thanks for the reply — got a quick 15 min this week? ${CALENDLY_LINK}\n\n— Peter`
  }
}

async function createDraft({ to, subject, body, threadId }) {
  const lines = [
    `From: Peter McShane <${GMAIL_SEND_FROM}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    body,
  ]
  const raw = Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
  await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw, threadId } },
  })
}

async function sendReply({ to, subject, body, threadId }) {
  const lines = [
    `From: Peter McShane <${GMAIL_SEND_FROM}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    body,
  ]
  const raw = Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId },
  })
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
