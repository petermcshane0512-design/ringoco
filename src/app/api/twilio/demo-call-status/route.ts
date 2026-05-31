import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

export const runtime = 'nodejs'

/**
 * POST /api/twilio/demo-call-status
 *
 * Twilio Status Callback for the public demo number (651) 467-7829.
 *
 * Fires on EVERY call state change (initiated, ringing, in-progress, completed)
 * regardless of whether the voice path goes to Vapi, our handler, or anything
 * else. So this SMS works even if Twilio Console points the demo line directly
 * at Vapi.
 *
 * Wire-up:
 *   1. Twilio Console → Phone Numbers → (651) 467-7829
 *   2. Scroll to "CALL STATUS CHANGES"
 *   3. Status callback URL: https://www.bellavego.com/api/twilio/demo-call-status
 *   4. Method: HTTP POST
 *   5. Events: initiated, ringing, in-progress, completed (Twilio sends all by default)
 *
 * Idempotent: only fires SMS on FIRST event per CallSid (in-memory dedup, also
 * gated by CallStatus === 'initiated' || 'ringing' so we don't notify on
 * in-progress/completed echoes).
 */

// Per-instance dedup (Vercel functions are short-lived but each call generates
// 4 events back-to-back, so this catches that).
const notifiedCalls = new Set<string>()

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const params: Record<string, string> = {}
  formData.forEach((v, k) => { params[k] = v as string })

  // Optional signature validation — Twilio status callbacks are signed with
  // the same algorithm as voice webhooks, but Vercel's proxy chain mangles
  // the host header so the computed URL drifts from what Twilio signed. Treat
  // signature as best-effort, log mismatches but don't 403 — the route only
  // emits an SMS to Peter's own phone, no data exfiltration risk if spoofed.
  const twilioSignature = req.headers.get('x-twilio-signature') || ''
  if (twilioSignature && process.env.TWILIO_AUTH_TOKEN) {
    const proto = req.headers.get('x-forwarded-proto') || 'https'
    const host = req.headers.get('host') || 'www.bellavego.com'
    const url = `${proto}://${host}/api/twilio/demo-call-status`
    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      twilioSignature,
      url,
      params,
    )
    if (!isValid) {
      console.warn('demo-call-status: signature mismatch — accepting anyway (low-risk route)', { url, host })
    }
  }

  const callSid = params['CallSid'] || ''
  const callerPhone = params['From'] || 'unknown'
  const calledNumber = params['To'] || ''
  const callStatus = params['CallStatus'] || ''

  // Only act on the first state we see for this CallSid. Twilio sends
  // 'initiated' first, then 'ringing', then 'in-progress', then 'completed'.
  // We fire on initiated/ringing so Peter gets the SMS before the AI even
  // starts answering.
  if (notifiedCalls.has(callSid)) {
    return NextResponse.json({ ok: true, skipped: 'already_notified' })
  }
  if (!['initiated', 'ringing'].includes(callStatus)) {
    return NextResponse.json({ ok: true, skipped: 'late_state', status: callStatus })
  }

  // Verify this is actually the demo line — if Twilio fires this URL for
  // another number by mistake, we skip.
  const demoNumber = process.env.TWILIO_DEMO_NUMBER
  if (demoNumber && calledNumber !== demoNumber) {
    return NextResponse.json({ ok: true, skipped: 'not_demo_number', called: calledNumber })
  }

  notifiedCalls.add(callSid)

  const peterPhone = process.env.FALLBACK_OWNER_PHONE
  if (!peterPhone) {
    console.error('demo-call-status: FALLBACK_OWNER_PHONE not set')
    return NextResponse.json({ ok: false, error: 'env missing' }, { status: 500 })
  }

  const fromNumber = demoNumber || process.env.TWILIO_PHONE_NUMBER || ''
  if (!fromNumber) {
    console.error('demo-call-status: no fromNumber available')
    return NextResponse.json({ ok: false, error: 'no from number' }, { status: 500 })
  }

  const nowEt = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  )

  try {
    await twilioClient.messages.create({
      from: fromNumber,
      to: peterPhone,
      body:
        `📞 LIVE DEMO CALL — someone calling BellAveGo AI right now\n\n` +
        `From: ${callerPhone}\n` +
        `Time: ${nowEt} ET\n\n` +
        `They're hearing Emma. Full transcript + lead summary lands when they hang up.`,
    })
  } catch (e) {
    console.error('demo-call-status SMS to Peter failed:', e)
    return NextResponse.json({ ok: false, error: 'sms failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sent_at: nowEt, caller: callerPhone })
}
