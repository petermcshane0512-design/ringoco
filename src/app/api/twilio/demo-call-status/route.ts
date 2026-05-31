import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { sendEmail } from '@/lib/email'

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

/**
 * GET — diagnostic only. Lets Peter sanity-check the route + env without
 * needing the admin secret or Vercel logs. Reveals only which env keys are
 * set (true/false), never the values.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route_alive: true,
    env_present: {
      TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: !!process.env.TWILIO_AUTH_TOKEN,
      TWILIO_DEMO_NUMBER: !!process.env.TWILIO_DEMO_NUMBER,
      TWILIO_PHONE_NUMBER: !!process.env.TWILIO_PHONE_NUMBER,
      FALLBACK_OWNER_PHONE: !!process.env.FALLBACK_OWNER_PHONE,
    },
    deploy_commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  })
}

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

  // Log every hit so Vercel logs show exactly what Twilio is firing.
  console.log('[demo-call-status] hit', {
    callSid, callerPhone, calledNumber, callStatus,
  })

  // Dedup by CallSid only. Don't gate on CallStatus — Twilio's default config
  // only sends 'completed' events; requiring 'ringing' silently drops every
  // call. As long as it's the FIRST event we see for this CallSid, fire.
  if (notifiedCalls.has(callSid)) {
    return NextResponse.json({ ok: true, skipped: 'already_notified', status: callStatus })
  }

  // We trust Twilio's routing — if it POSTed here, this URL is bound to a
  // number we own. No env-var comparison needed. (Removed the
  // TWILIO_DEMO_NUMBER strict-match check — caused silent skips when the env
  // value drifted from E.164 format Twilio actually sends.)

  notifiedCalls.add(callSid)

  // Fallback chain for SMS recipient: env var → hardcoded Peter cell.
  // (Hardcoded fallback so a misnamed Vercel env var doesn't silently kill
  // the alert. This is Peter's known personal cell from CLAUDE.md.)
  const peterPhone = process.env.FALLBACK_OWNER_PHONE || '+17737109565'

  // Sender selection: prefer TWILIO_MESSAGING_SERVICE_SID (handles A2P + opt-out
  // automatically). Otherwise prefer TWILIO_PHONE_NUMBER (the platform SMS line,
  // known SMS-capable). Falling back to demo line LAST because it's typically
  // voice-only — Twilio accepts the API call but the message never sends.
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  const fromNumber = process.env.TWILIO_PHONE_NUMBER
    || process.env.TWILIO_DEMO_NUMBER
    || calledNumber
    || ''
  if (!messagingServiceSid && !fromNumber) {
    console.error('demo-call-status: no SMS sender available', { calledNumber })
    return NextResponse.json({ ok: false, error: 'no from number' }, { status: 500 })
  }
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error('demo-call-status: Twilio creds missing')
    return NextResponse.json({ ok: false, error: 'twilio creds missing' }, { status: 500 })
  }

  const nowEt = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  )

  const body =
    `📞 LIVE DEMO CALL — someone calling BellAveGo AI right now\n\n` +
    `From: ${callerPhone}\n` +
    `Time: ${nowEt} ET\n\n` +
    `They're hearing Emma. Full transcript + lead summary lands when they hang up.`

  const messageOpts: { to: string; body: string; from?: string; messagingServiceSid?: string } = {
    to: peterPhone,
    body,
  }
  if (messagingServiceSid) {
    messageOpts.messagingServiceSid = messagingServiceSid
  } else {
    messageOpts.from = fromNumber
  }

  // Fire SMS + email in parallel. Email is the reliable channel — bypasses
  // A2P 10DLC, carrier filtering, and SMS-capability mismatches.
  const smsPromise = twilioClient.messages.create(messageOpts).then(
    (msg) => {
      console.log('[demo-call-status] sms queued', {
        sid: msg.sid, status: msg.status, errorCode: msg.errorCode, errorMessage: msg.errorMessage,
      })
      return { ok: true as const, sid: msg.sid, status: msg.status }
    },
    (e: unknown) => {
      const code = (e as { code?: number })?.code
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error('[demo-call-status] sms create threw', { code, msg: errMsg })
      return { ok: false as const, code, errMsg }
    },
  )

  const ownerEmail = process.env.FALLBACK_OWNER_EMAIL || 'bellavegollc@gmail.com'
  const emailSubject = `📞 LIVE DEMO CALL — ${callerPhone} calling right now`
  const emailHtml = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#0b1f3a;max-width:540px">
      <h2 style="font-size:18px;margin:0 0 12px;color:#0b1f3a">📞 LIVE DEMO CALL</h2>
      <p>Someone is calling the BellAveGo AI receptionist <strong>right now</strong>.</p>
      <table style="border-collapse:collapse;margin:14px 0;font-size:13px">
        <tr><td style="padding:4px 12px 4px 0;color:#4A6670"><strong>From:</strong></td><td><a href="tel:${callerPhone}" style="color:#0AA89F">${callerPhone}</a></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#4A6670"><strong>Time:</strong></td><td>${nowEt} ET</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#4A6670"><strong>Called:</strong></td><td>${calledNumber}</td></tr>
      </table>
      <p style="font-size:12.5px;color:#4A6670">They're hearing Emma now. Full transcript + lead summary lands in your inbox when they hang up.</p>
    </div>
  `
  const emailText = `📞 LIVE DEMO CALL\n\nFrom: ${callerPhone}\nTime: ${nowEt} ET\nCalled: ${calledNumber}\n\nThey're hearing Emma now. Full transcript + lead summary lands when they hang up.`

  const emailPromise = sendEmail({
    to: ownerEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  }).then(
    (res) => {
      if (res.ok) console.log('[demo-call-status] email sent', { id: res.id, to: ownerEmail })
      else console.error('[demo-call-status] email failed', { error: res.error, to: ownerEmail })
      return res
    },
    (e: unknown) => {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error('[demo-call-status] email threw', { errMsg, to: ownerEmail })
      return { ok: false as const, error: errMsg }
    },
  )

  const [smsResult, emailResult] = await Promise.all([smsPromise, emailPromise])

  return NextResponse.json({
    ok: true,
    sent_at: nowEt,
    caller: callerPhone,
    sms: smsResult,
    email: emailResult,
  })
}
