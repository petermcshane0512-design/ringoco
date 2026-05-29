import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const INSTANTLY_KEY = process.env.INSTANTLY_API_KEY
const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2'

export type LeadContext = {
  email: string
  businessName?: string | null
  ownerFirstName?: string | null
  city?: string | null
  trade?: string | null
}

export type DraftRow = {
  id: string
  short_code: string
  lead_email: string
  campaign_id: string | null
  business_name: string | null
  trade: string | null
  city: string | null
  original_reply: string
  draft_body: string
  source_event: Record<string, unknown> | null
  status: string
  failure_reason: string | null
  created_at: string
  expires_at: string
  acted_at: string | null
  sent_at: string | null
}

/**
 * Generate a short, founder-tone reply to a hot cold-email response.
 *
 * Sonnet 4.6 (not Haiku) because reply quality directly drives demo conversion.
 * Constraints: under 60 words, no emojis, no markdown, no "leverage/synergy",
 * always end with one clear ask (link, time slot, or yes/no).
 */
export async function draftReplyForHotLead(opts: {
  lead: LeadContext
  replyBody: string
  replySubject?: string
}): Promise<string> {
  const { lead, replyBody, replySubject } = opts
  const system = `You write replies to interested cold-email leads for BellAveGo, an AI receptionist for home-service contractors (HVAC, plumbing, electrical). The user just received a reply from a lead and you draft what should go back.

Rules:
- Under 60 words.
- Written by Peter, the founder. First-person ("I", "we"). Casual but direct.
- One specific ask at the end. Either: "want the signup link?", "what's your trade?", "free for a 5-min call?", or a Calendly link request.
- NEVER use: leverage, synergy, robust, solution, transform, em-dashes longer than one. No emojis. No markdown.
- If they ask price: $147/mo Starter (60 calls), $297/mo Pro (300 calls), $597/mo Elite (unlimited + custom integrations). Always 7-day free trial.
- If they ask demo: tell them to call (651) 467-7829 to talk to the AI directly.
- If they sound skeptical: address the specific objection in one line, then ask.
- If they ask "who is this": say BellAveGo, AI that answers missed calls for contractors, built by Peter (solo founder).

Output ONLY the reply body. No subject line. No "Hi {Name}", no "Best, Peter" sign-off — those get added by Instantly.`

  const user = `Lead context:
- Email: ${lead.email}
- Business: ${lead.businessName ?? 'unknown'}
- Trade: ${lead.trade ?? 'unknown'}
- City: ${lead.city ?? 'unknown'}
- First name: ${lead.ownerFirstName ?? 'unknown'}

Their reply${replySubject ? ` (subject: "${replySubject}")` : ''}:
"${replyBody.slice(0, 2000)}"

Draft the reply now.`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 250,
      system,
      messages: [{ role: 'user', content: user }],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
    const cleaned = text
      .replace(/^["']|["']$/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (cleaned.length < 10) {
      return fallbackDraft(lead, replyBody)
    }
    return cleaned
  } catch (e) {
    console.error('[hotReplyDraft] Claude draft failed:', e)
    return fallbackDraft(lead, replyBody)
  }
}

function fallbackDraft(lead: LeadContext, replyBody: string): string {
  const name = lead.ownerFirstName ? `${lead.ownerFirstName}, ` : ''
  if (/price|cost|how much/i.test(replyBody)) {
    return `${name}3 tiers: Starter $147/mo (60 calls), Pro $297/mo (300 calls), Elite $597/mo (unlimited + custom integrations). 7-day free trial, card on file, cancel anytime. Want the signup link?`
  }
  if (/demo|show|see/i.test(replyBody)) {
    return `${name}call (651) 467-7829 and talk to it like you're a customer. 90 seconds, no rep on the other end. After that I'll send you the signup link if you want.`
  }
  return `${name}thanks for replying. Quick answer to your question first — then if it's worth a 5-min call I can show you the rest. What's your biggest blocker right now: missed calls, no-shows, or after-hours?`
}

export function newShortCode(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789' // omit l, o, 0, 1 (ambiguous on SMS)
  let out = ''
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

/**
 * Insert a pending draft with a unique short_code. Retries up to 5x on
 * the rare short_code collision (32^4 ≈ 1M space, near-zero collision risk
 * but cheap to retry).
 */
export async function insertPendingDraft(opts: {
  lead: LeadContext
  campaignId: string | null
  originalReply: string
  draftBody: string
  sourceEvent: Record<string, unknown> | null
}): Promise<DraftRow | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newShortCode()
    const { data, error } = await supabase
      .from('outreach_pending_drafts')
      .insert({
        short_code: code,
        lead_email: opts.lead.email,
        campaign_id: opts.campaignId,
        business_name: opts.lead.businessName,
        trade: opts.lead.trade,
        city: opts.lead.city,
        original_reply: opts.originalReply,
        draft_body: opts.draftBody,
        source_event: opts.sourceEvent,
      })
      .select()
      .single<DraftRow>()
    if (!error && data) return data
    if (error?.code !== '23505') {
      console.error('[hotReplyDraft] insert failed:', error?.message)
      return null
    }
  }
  console.error('[hotReplyDraft] short_code collision exhausted retries')
  return null
}

/**
 * Look up the most recent pending draft by short_code. Returns null if not
 * found, expired, or already acted on.
 */
export async function findPendingDraft(shortCode: string): Promise<DraftRow | null> {
  const { data } = await supabase
    .from('outreach_pending_drafts')
    .select('*')
    .eq('short_code', shortCode.toLowerCase())
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle<DraftRow>()
  return data
}

export async function markDraftStatus(opts: {
  id: string
  status: 'sent' | 'killed' | 'edited' | 'expired' | 'failed'
  newBody?: string
  failureReason?: string
}): Promise<void> {
  const patch: Record<string, unknown> = {
    status: opts.status,
    acted_at: new Date().toISOString(),
  }
  if (opts.newBody) patch.draft_body = opts.newBody
  if (opts.failureReason) patch.failure_reason = opts.failureReason
  if (opts.status === 'sent') patch.sent_at = new Date().toISOString()
  const { error } = await supabase
    .from('outreach_pending_drafts')
    .update(patch)
    .eq('id', opts.id)
  if (error) console.error('[hotReplyDraft] markDraftStatus failed:', error.message)
}

/**
 * Ship a draft as an actual reply to the lead via Instantly's API.
 *
 * Instantly v2 reply endpoint:
 *   POST /api/v2/emails/reply
 *   body: { reply_to_uuid: <message_id>, body, html, subject? }
 *
 * If the source_event doesn't carry a reply_to / message UUID, we fall back
 * to creating an outbound email to the lead via /api/v2/emails (still
 * delivers, just not threaded). Failure returns ok:false + reason — the
 * SMS handler relays this back to Peter so he can act.
 */
export async function sendReplyViaInstantly(opts: {
  draft: DraftRow
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!INSTANTLY_KEY) {
    return { ok: false, reason: 'INSTANTLY_API_KEY missing — cannot ship reply' }
  }

  const event = (opts.draft.source_event ?? {}) as Record<string, unknown>
  const replyToUuid =
    (event.reply_to_uuid as string | undefined) ??
    (event.message_id as string | undefined) ??
    (event.id as string | undefined) ??
    null

  const subject =
    (event.reply_subject as string | undefined) ??
    (event.subject as string | undefined) ??
    'Re:'

  // Threaded reply if we have a UUID
  if (replyToUuid) {
    try {
      const res = await fetch(`${INSTANTLY_BASE}/emails/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${INSTANTLY_KEY}`,
        },
        body: JSON.stringify({
          reply_to_uuid: replyToUuid,
          body: opts.draft.draft_body,
          html: opts.draft.draft_body.replace(/\n/g, '<br>'),
          subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        }),
      })
      if (res.ok) return { ok: true }
      const txt = await res.text()
      return { ok: false, reason: `Instantly reply ${res.status}: ${txt.slice(0, 200)}` }
    } catch (e) {
      return { ok: false, reason: `Instantly reply threw: ${(e as Error).message}` }
    }
  }

  // No thread UUID — outbound new email (won't show as threaded reply in lead's inbox)
  try {
    const res = await fetch(`${INSTANTLY_BASE}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INSTANTLY_KEY}`,
      },
      body: JSON.stringify({
        to: opts.draft.lead_email,
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        body: opts.draft.draft_body,
        html: opts.draft.draft_body.replace(/\n/g, '<br>'),
      }),
    })
    if (res.ok) return { ok: true }
    const txt = await res.text()
    return { ok: false, reason: `Instantly send ${res.status}: ${txt.slice(0, 200)}` }
  } catch (e) {
    return { ok: false, reason: `Instantly send threw: ${(e as Error).message}` }
  }
}
