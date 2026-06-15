import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import twilio from 'twilio'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { draftReplyForHotLead } from '@/lib/hotReplyDraft'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST/GET /api/admin/auto-reply — full auto-responder for cold-email
 * replies (2026-06-12, per Peter "fully automated").
 *
 * Loop: list campaign repliers → for each, pull the thread → if the lead
 * spoke LAST (awaiting us), classify their message → guardrail → draft in
 * Peter's voice → send threaded via Instantly → SMS Peter a copy.
 *
 * GUARDRAILS (the whole reason this is safe to run on cold domains):
 *   - NEGATIVE / UNSUBSCRIBE → never reply. Mark the lead not_interested +
 *     dnc so the sequence stops. Auto-replying to a "no" is the #1 way to
 *     earn a spam complaint.
 *   - AUTO_REPLY (out-of-office) → skip silently.
 *   - One auto-reply per inbound: we only act when the lead's LATEST thread
 *     message is theirs. Once we've replied (our msg becomes latest), the
 *     thread is skipped until they write again — no loops, no double-sends.
 *   - Hard cap: never more than MAX_AUTO_REPLIES of our replies in a thread;
 *     past that it escalates to Peter by SMS instead of sending.
 *   - Kill switch: env AUTO_REPLY_ENABLED='false' disables sending entirely.
 *   - ?dry=1 classifies + drafts but sends nothing (preview).
 *
 * Auth: requireAdmin OR x-vercel-cron.
 */

const CAMPAIGN = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const BASE = 'https://api.instantly.ai/api/v2'
const MAX_AUTO_REPLIES = 2

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function H() {
  return { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, 'Content-Type': 'application/json' }
}

type ThreadMsg = { id: string; from: string; to: string; subject: string | null; body: string; at: string; fromLead: boolean }

/** Pull a lead's whole thread, normalized + sorted oldest→newest. */
async function fetchThread(leadEmail: string): Promise<ThreadMsg[]> {
  const r = await fetch(`${BASE}/emails?campaign_id=${CAMPAIGN}&lead=${encodeURIComponent(leadEmail)}&limit=25`, { headers: H() })
  if (!r.ok) return []
  const j = await r.json()
  const items = (j.items ?? j.data ?? []) as Array<Record<string, unknown>>
  const msgs: ThreadMsg[] = items.map((m) => {
    const bodyObj = (m.body ?? {}) as Record<string, unknown>
    const text = String(bodyObj.text ?? m.body_text ?? m.content_preview ?? m.snippet ?? '').replace(/\s+/g, ' ').trim()
    const from = String(m.from_address_email ?? m.from_email ?? (m.from as string) ?? '').toLowerCase()
    const to = String(m.to_address_email ?? m.to_email ?? (m.to as string) ?? '').toLowerCase()
    // Direction: Instantly tags received replies as ue_type 2 / email_type
    // 'received'; fall back to from-address matching the lead.
    const typeStr = String(m.ue_type ?? m.email_type ?? '').toLowerCase()
    const fromLead = typeStr.includes('received') || typeStr === '2' || from.includes(leadEmail.toLowerCase())
    return {
      id: String(m.id ?? ''),
      from, to,
      subject: (m.subject as string) ?? null,
      body: text,
      at: String(m.timestamp_created ?? m.created_at ?? ''),
      fromLead,
    }
  }).filter((m) => m.id)
  msgs.sort((a, b) => a.at.localeCompare(b.at))
  return msgs
}

type Intent = 'POSITIVE' | 'QUESTION' | 'OBJECTION' | 'NEGATIVE' | 'UNSUBSCRIBE' | 'AUTO_REPLY'

async function classify(body: string): Promise<Intent> {
  // Hard unsubscribe words short-circuit (never risk a send).
  if (/\b(unsubscribe|remove me|take me off|stop emailing|do not (contact|email)|leave me alone)\b/i.test(body)) return 'UNSUBSCRIBE'
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 20,
      system: `Classify a cold-email reply into exactly one label: POSITIVE (interested / wants to proceed), QUESTION (asking something, door open), OBJECTION (pushback but not a hard no), NEGATIVE (not interested / annoyed / "stop"), UNSUBSCRIBE (explicit opt-out), AUTO_REPLY (out-of-office / vacation autoresponder). Output ONLY the label.`,
      messages: [{ role: 'user', content: body.slice(0, 1500) }],
    })
    const t = (res.content[0]?.type === 'text' ? res.content[0].text : '').trim().toUpperCase()
    const valid: Intent[] = ['POSITIVE', 'QUESTION', 'OBJECTION', 'NEGATIVE', 'UNSUBSCRIBE', 'AUTO_REPLY']
    return valid.find((v) => t.includes(v)) ?? 'NEGATIVE'  // unknown → treat as no-send
  } catch {
    return 'NEGATIVE'
  }
}

async function sendThreadedReply(replyToUuid: string, leadEmail: string, subject: string | null, draftBody: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(`${BASE}/emails/reply`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        reply_to_uuid: replyToUuid,
        body: draftBody,
        html: draftBody.replace(/\n/g, '<br>'),
        subject: subject?.startsWith('Re:') ? subject : `Re: ${subject ?? ''}`.trim(),
      }),
    })
    if (res.ok) return { ok: true }
    return { ok: false, reason: `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 150)}` }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

async function smsPeter(text: string) {
  try {
    const tw = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    await tw.messages.create({ body: text, from: process.env.TWILIO_PHONE_NUMBER!, to: process.env.FOUNDER_ALERT_PHONE || '+17737109565' })
  } catch { /* alerts are best-effort */ }
}

async function run(dry: boolean) {
  if (!process.env.INSTANTLY_API_KEY) return { ok: false, error: 'INSTANTLY_API_KEY not set' }
  const enabled = process.env.AUTO_REPLY_ENABLED !== 'false'
  const willSend = enabled && !dry

  // Find repliers.
  const repliers: Array<{ email: string; company: string | null }> = []
  let cursor: string | undefined
  for (let p = 0; p < 12; p++) {
    const r = await fetch(`${BASE}/leads/list`, { method: 'POST', headers: H(), body: JSON.stringify({ campaign: CAMPAIGN, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }) })
    if (!r.ok) break
    const j = await r.json()
    for (const l of j.items ?? []) {
      if ((l.email_reply_count ?? 0) > 0) repliers.push({ email: (l.email || '').toLowerCase(), company: l.company_name ?? l.payload?.company_name ?? l.payload?.business_name ?? null })
    }
    cursor = j.next_starting_after
    if (!cursor) break
  }

  const actions: Array<Record<string, unknown>> = []
  for (const rl of repliers) {
    const thread = await fetchThread(rl.email)
    if (thread.length === 0) { actions.push({ email: rl.email, action: 'skip', why: 'no thread loaded' }); continue }
    const last = thread[thread.length - 1]
    // Only act when the LEAD spoke last (we owe a reply). If our message is
    // latest, the inbound is already handled — no loop, no double-send.
    if (!last.fromLead) { actions.push({ email: rl.email, action: 'skip', why: 'already replied (our msg latest)' }); continue }
    // Hard cap on our replies in this thread.
    const ourReplies = thread.filter((m) => !m.fromLead).length
    const intent = await classify(last.body)

    if (intent === 'NEGATIVE' || intent === 'UNSUBSCRIBE') {
      if (willSend) {
        await supabase.from('outreach_leads').update({
          status: intent === 'UNSUBSCRIBE' ? 'unsubscribed' : 'not_interested',
          dnc_until: '2099-01-01',
        }).eq('email', rl.email)
        // 2026-06-15 — COMPLIANCE: DB status only stops RE-LOADING. The active
        // Instantly sequence keeps firing steps 2/3 at someone who said stop
        // until the address is blocklisted. Blocklist halts it for real.
        await fetch(`${BASE}/block-lists-entries`, {
          method: 'POST', headers: H(), body: JSON.stringify({ bl_value: rl.email }),
        }).catch(() => { /* non-fatal — DB DNC still set */ })
      }
      actions.push({ email: rl.email, intent, action: willSend ? 'marked_dnc_blocklisted' : 'would_mark_dnc', reply: last.body.slice(0, 120) })
      continue
    }
    if (intent === 'AUTO_REPLY') { actions.push({ email: rl.email, intent, action: 'skip_ooo' }); continue }
    if (ourReplies >= MAX_AUTO_REPLIES) {
      if (willSend) await smsPeter(`🤝 ESCALATE: ${rl.company || rl.email} replied again (${ourReplies} auto-replies already). Take this one by hand.\n"${last.body.slice(0, 180)}"`)
      actions.push({ email: rl.email, intent, action: 'escalated_to_peter', why: `${ourReplies} auto-replies cap` })
      continue
    }

    // POSITIVE / QUESTION / OBJECTION → draft + (maybe) send.
    const draft = await draftReplyForHotLead({
      lead: { email: rl.email, businessName: rl.company, trade: null, city: null, ownerFirstName: null },
      replyBody: last.body,
      replySubject: last.subject ?? undefined,
    })

    if (!willSend) {
      actions.push({ email: rl.email, intent, action: dry ? 'dry_run_draft' : 'disabled_draft', their_reply: last.body.slice(0, 150), draft })
      continue
    }
    const sent = await sendThreadedReply(last.id, rl.email, last.subject, draft)
    if (sent.ok) {
      await supabase.from('outreach_leads').update({ status: 'auto_replied' }).eq('email', rl.email)
      await smsPeter(`🤖 AUTO-REPLIED to ${rl.company || rl.email} (${intent})\n\nThey said: "${last.body.slice(0, 140)}"\n\nWe sent: "${draft.slice(0, 200)}"`)
    }
    actions.push({ email: rl.email, intent, action: sent.ok ? 'auto_replied' : 'send_failed', reason: sent.reason, draft })
  }

  return {
    ok: true,
    mode: dry ? 'dry_run' : willSend ? 'live' : 'disabled',
    enabled,
    repliers: repliers.length,
    actions,
  }
}

export async function POST(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron) { const gate = await requireAdmin(); if (!gate.ok) return gate.res }
  return NextResponse.json(await run(req.nextUrl.searchParams.get('dry') === '1'))
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron) { const gate = await requireAdmin(); if (!gate.ok) return gate.res }
  // GET defaults to DRY for safety; cron uses POST.
  return NextResponse.json(await run(req.nextUrl.searchParams.get('dry') !== '0'))
}
