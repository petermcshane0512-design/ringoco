import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Read-only Twilio voice-call log lookup. Given a `to` number, returns
 * the last N inbound voice calls WITH status + duration + direction +
 * the voiceUrl Twilio dispatched the call to. Diagnoses "I called my
 * BellAveGo number and it went to voicemail" — tells us whether the
 * call even hit Twilio, and where Twilio sent it.
 *
 * Auth: requireAdmin().
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: 'Twilio creds missing' }, { status: 500 })
  }

  const params = new URL(req.url).searchParams
  const to = params.get('to')
  const from = params.get('from')
  const limit = Math.min(parseInt(params.get('limit') ?? '10', 10), 50)

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  try {
    const list = await client.calls.list({
      ...(to ? { to } : {}),
      ...(from ? { from } : {}),
      limit,
    })
    return NextResponse.json({
      query: { to, from, limit },
      count: list.length,
      calls: list.map((c) => ({
        sid: c.sid,
        date_created: c.dateCreated,
        from: c.from,
        to: c.to,
        direction: c.direction,
        status: c.status,
        duration_sec: c.duration,
        price: c.price,
        answered_by: c.answeredBy,
        forwarded_from: c.forwardedFrom,
        // The URL Twilio sent the call to (where it routed audio). If this
        // is wrong, the call would never reach Vapi.
        // Note: per-call URL not returned by REST API — to see what URL
        // Twilio thinks the number is bound to, check the IncomingPhoneNumber.
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
