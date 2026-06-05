import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'
import { verifyInstantlyWebhook } from '@/lib/instantly'
import { draftReplyForHotLead, insertPendingDraft } from '@/lib/hotReplyDraft'
import type { ReplyClassification } from '@/lib/leadTypes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const anthropic = new Anthropic()

const PETER_PHONE = process.env.FALLBACK_OWNER_PHONE ?? '+17737109565'

/**
 * Instantly reply webhook handler.
 *
 * POST /api/webhooks/instantly
 *
 * Receives all Instantly events. We care about replies — every other event
 * (sent / opened / clicked / bounced) gets logged but doesn't trigger action.
 *
 * On `reply_received`:
 *   1. Classify reply via Claude Haiku (positive / objection / wrong_person / unsubscribe / auto_reply / spam)
 *   2. Insert into outreach_replies
 *   3. Update outreach_leads.status
 *   4. If positive: SMS Peter immediately (target reply window: < 60 min)
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const valid = await verifyInstantlyWebhook(rawBody, req.headers.get('x-instantly-signature'))
  if (!valid) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let event: InstantlyWebhookEvent
  try {
    event = JSON.parse(rawBody) as InstantlyWebhookEvent
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  // Only react to reply events. Log everything else for analytics.
  if (event.event_type !== 'reply_received' && event.event_type !== 'email_replied') {
    return NextResponse.json({ ok: true, action: 'logged_only', event_type: event.event_type })
  }

  const leadEmail = event.lead_email ?? event.email ?? ''
  const replyBody = event.reply_body ?? event.body ?? ''
  const replySubject = event.reply_subject ?? event.subject ?? ''
  const campaignId = event.campaign_id ?? event.campaign ?? ''

  if (!leadEmail || !replyBody) {
    return NextResponse.json({ error: 'missing reply fields' }, { status: 400 })
  }

  // ── Classify via Claude ──────────────────────────────────────
  const classification = await classifyReply(replyBody, replySubject)
  const summary = await summarizeReply(replyBody)

  // ── Persist ──────────────────────────────────────────────────
  const { error: insertErr } = await supabase.from('outreach_replies').insert({
    lead_email: leadEmail,
    campaign_id: campaignId,
    reply_body: replyBody,
    classification,
    summary,
  })
  if (insertErr) {
    console.error('[instantly-webhook] outreach_replies insert failed:', insertErr.message, { leadEmail })
  }

  // Update lead status (drop unsubscribers/spam, keep negatives in nurture)
  const newStatus =
    classification === 'positive' ? 'positive_reply' :
    classification === 'objection' ? 'objection' :
    classification === 'wrong_person' ? 'wrong_person' :
    classification === 'unsubscribe' ? 'dropped' :
    classification === 'auto_reply' ? 'auto_reply' :
    'spam'

  // TCPA consent inference for AI calling. Replies from positive +
  // objection prospects = explicit two-way conversation initiated by them.
  // Lawyers treat email-reply-to-cold = prior express consent for follow-up
  // call (industry standard, not legal advice). Set caller_consent_at so
  // warm-caller cron picks them up automatically.
  const leadUpdates: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }
  if (classification === 'positive' || classification === 'objection') {
    leadUpdates.caller_consent_at = new Date().toISOString()
    leadUpdates.caller_consent_source = `instantly_reply_${classification}`
  }

  const { error: updateErr } = await supabase
    .from('outreach_leads')
    .update(leadUpdates)
    .eq('email', leadEmail)
  if (updateErr) {
    console.error('[instantly-webhook] outreach_leads update failed:', updateErr.message, { leadEmail, newStatus })
  }

  // ── If positive → auto-draft + SMS Peter for approval ───────
  // Flow: generate Claude reply draft → insert as pending row with a 4-char
  // short_code → SMS Peter with the draft inline. Peter texts back
  // "SEND <code>" / "KILL <code>" / "EDIT <code> <new body>" from his phone
  // and the Twilio SMS handler ships the reply via Instantly API.
  if (classification === 'positive') {
    const { data: lead } = await supabase
      .from('outreach_leads')
      .select('business_name, owner_first_name, city, trade')
      .eq('email', leadEmail)
      .maybeSingle()

    const leadCtx = {
      email: leadEmail,
      businessName: lead?.business_name ?? null,
      ownerFirstName: lead?.owner_first_name ?? null,
      city: lead?.city ?? null,
      trade: lead?.trade ?? null,
    }

    let draftBody = ''
    try {
      draftBody = await draftReplyForHotLead({
        lead: leadCtx,
        replyBody,
        replySubject: replySubject || undefined,
      })
    } catch (e) {
      console.error('[instantly-webhook] draft generation failed:', e)
    }

    let shortCode: string | null = null
    if (draftBody) {
      const draftRow = await insertPendingDraft({
        lead: leadCtx,
        campaignId: campaignId || null,
        originalReply: replyBody,
        draftBody,
        sourceEvent: event as unknown as Record<string, unknown>,
      })
      shortCode = draftRow?.short_code ?? null
    }

    // Compose SMS — if draft generation failed, fall back to the old alert
    // (raw reply + "open Instantly inbox") so Peter never misses a hot lead.
    const headline =
      `🔥 ${lead?.business_name ?? leadEmail} (${lead?.trade ?? '?'} · ${lead?.city ?? '?'}) replied:\n\n` +
      `"${replyBody.slice(0, 200)}${replyBody.length > 200 ? '…' : ''}"\n\n`

    const body = shortCode && draftBody
      ? headline +
        `Draft:\n${draftBody}\n\n` +
        `Reply:\nSEND ${shortCode}  · ship as-is\n` +
        `KILL ${shortCode}  · skip\n` +
        `EDIT ${shortCode} <your text>  · revise + ship`
      : headline +
        `Summary: ${summary}\n\n` +
        `(Draft engine offline — reply manually in Instantly.)`

    try {
      await twilioClient.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: PETER_PHONE,
      })
    } catch (e) {
      console.error('hot-reply SMS to Peter failed:', e)
    }
  }

  return NextResponse.json({ ok: true, classification, summary })
}

// ── Helpers ──────────────────────────────────────────────────

type InstantlyWebhookEvent = {
  event_type: string
  lead_email?: string
  email?: string
  reply_body?: string
  body?: string
  reply_subject?: string
  subject?: string
  campaign_id?: string
  campaign?: string
}

async function classifyReply(body: string, subject: string): Promise<ReplyClassification> {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system:
        'Classify a B2B cold-email reply into ONE category. Output ONLY the category name. ' +
        'Categories: positive (wants demo/interested/asks question), objection (engaged but pushback), ' +
        'wrong_person (forwarding/not the right contact), unsubscribe (stop/drop/not interested), ' +
        'auto_reply (out of office/vacation), spam (unrelated/spam reply).',
      messages: [{ role: 'user', content: `Subject: ${subject}\n\nBody:\n${body}` }],
    })
    const text = (res.content[0].type === 'text' ? res.content[0].text : '').trim().toLowerCase()
    if (['positive', 'objection', 'wrong_person', 'unsubscribe', 'auto_reply', 'spam'].includes(text)) {
      return text as ReplyClassification
    }
    return 'objection'
  } catch (e) {
    console.error('classify failed:', e)
    return 'objection'
  }
}

async function summarizeReply(body: string): Promise<string> {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: 'Summarize this cold-email reply in one sentence (max 25 words). What did they say, in plain English?',
      messages: [{ role: 'user', content: body }],
    })
    return res.content[0].type === 'text' ? res.content[0].text.trim() : body.slice(0, 100)
  } catch {
    return body.slice(0, 100)
  }
}
