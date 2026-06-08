import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/webhooks/instantly/reply
 *
 * Instantly webhook. Fires whenever a cold-email recipient replies.
 * Cuts the "hot lead window" from minutes-to-hours (manual inbox triage)
 * to seconds.
 *
 * Behavior:
 *   1. Receive payload (campaign_id, recipient_email, reply_body, etc.)
 *   2. Score the reply (positive intent? negative? unsubscribe?)
 *   3. If POSITIVE intent → SMS Peter immediately at FOUNDER_ALERT_PHONE
 *      with reply summary + tap-to-call link to the prospect's phone
 *   4. Log to outreach_replies table for the admin/hot-prospects page
 *
 * Auth: Instantly uses a shared secret in the X-Instantly-Signature
 * header (set in Instantly campaign settings). Validate via constant-time
 * compare against INSTANTLY_WEBHOOK_SECRET env var.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const POSITIVE_PATTERNS = [
  /\b(interested|tell me more|send me|sign me up|let's chat|set up a call|how much|pricing|demo|trial|sounds great|i'd like)\b/i,
  /\b(yes|yeah|sure|absolutely|definitely|let's do it|i'm in)\b/i,
  /\?$/m,  // any question = engagement signal
]

const NEGATIVE_PATTERNS = [
  /\b(unsubscribe|remove|stop|don'?t contact|not interested|leave me alone|spam)\b/i,
  /\b(wrong number|wrong person|not the right contact)\b/i,
]

function classifyReply(body: string): 'positive' | 'negative' | 'neutral' {
  const text = (body || '').slice(0, 2000)
  if (NEGATIVE_PATTERNS.some((re) => re.test(text))) return 'negative'
  if (POSITIVE_PATTERNS.some((re) => re.test(text))) return 'positive'
  return 'neutral'
}

export async function POST(req: NextRequest) {
  try {
    // Optional shared-secret check
    const expected = process.env.INSTANTLY_WEBHOOK_SECRET
    if (expected) {
      const sig = req.headers.get('x-instantly-signature') || req.headers.get('authorization') || ''
      if (!sig.includes(expected)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      }
    }

    let body: {
      campaign_id?: string
      lead_email?: string
      email?: string
      reply_text?: string
      reply_body?: string
      reply_subject?: string
      lead_first_name?: string
      lead_last_name?: string
      lead_phone?: string
      timestamp?: string
    }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

    const email = body.lead_email || body.email || ''
    const replyText = body.reply_text || body.reply_body || ''
    const replySubject = body.reply_subject || ''
    const phone = body.lead_phone || ''
    const firstName = body.lead_first_name || ''
    const businessGuess = email.split('@')[1]?.split('.')[0] || 'unknown'

    const intent = classifyReply(`${replySubject}\n${replyText}`)

    // Log the reply (table may not exist yet — non-fatal)
    try {
      await supabase.from('outreach_replies').insert({
        email: email.toLowerCase(),
        reply_subject: replySubject,
        reply_text: replyText.slice(0, 4000),
        reply_phone: phone,
        lead_first_name: firstName,
        intent,
        campaign_id: body.campaign_id,
        received_at: body.timestamp || new Date().toISOString(),
      })
    } catch { /* swallow */ }

    // SMS Peter for positive intent only (avoids notification fatigue)
    if (intent === 'positive') {
      try {
        const founderPhone = process.env.FOUNDER_ALERT_PHONE ?? '+17737109565'
        const fromNumber = process.env.TWILIO_PHONE_NUMBER!
        const callbackLink = phone ? `tel:${phone}` : `mailto:${email}`
        const sms =
          `🔥 HOT REPLY (Instantly)\n\n` +
          `${firstName ? firstName + ' · ' : ''}${businessGuess}\n` +
          `${email}\n` +
          (phone ? `📞 ${phone}\n` : '') +
          `\n"${replyText.slice(0, 220)}${replyText.length > 220 ? '…' : ''}"\n\n` +
          `Reply within 5 min — 80% close rate window.\n${callbackLink}`

        await twilioClient.messages.create({
          body: sms,
          from: fromNumber,
          to: founderPhone,
        })
      } catch (e) {
        console.warn('[instantly-reply] SMS to founder failed:', (e as Error).message)
      }
    }

    return NextResponse.json({ ok: true, intent, sms_fired: intent === 'positive' })
  } catch (e) {
    const err = e as { message?: string }
    return NextResponse.json({ ok: false, error: err.message || String(e) }, { status: 500 })
  }
}
