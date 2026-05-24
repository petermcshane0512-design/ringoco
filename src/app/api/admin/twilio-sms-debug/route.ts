import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Read-only Twilio SMS log lookup. Given a `to` phone (and optional
 * `from`), returns the last N message attempts WITH delivery status +
 * error code. Lets us diagnose "I never got the SMS" without guessing.
 *
 * Common error codes you'll see:
 *   30003 — handset unreachable / unknown destination
 *   30004 — recipient blocked sender
 *   30005 — unknown destination handset
 *   30006 — landline / unreachable carrier
 *   30007 — carrier filter (spam-flagged)
 *   30034 — A2P 10DLC unregistered (most common right now)
 *   21610 — recipient has STOP'd this sender
 *   21408 — region blocked
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
  if (!to) {
    return NextResponse.json({ error: 'missing ?to= query param (E.164, e.g. %2B17737109565)' }, { status: 400 })
  }

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  try {
    const list = await client.messages.list({
      to,
      ...(from ? { from } : {}),
      limit,
    })
    return NextResponse.json({
      query: { to, from, limit },
      count: list.length,
      messages: list.map((m) => ({
        sid: m.sid,
        date_sent: m.dateSent,
        date_created: m.dateCreated,
        from: m.from,
        to: m.to,
        status: m.status,
        error_code: m.errorCode,
        error_message: m.errorMessage,
        num_segments: m.numSegments,
        price: m.price,
        body_preview: m.body?.slice(0, 140),
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
