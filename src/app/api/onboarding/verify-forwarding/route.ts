import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

/**
 * Real forwarding verification.
 *
 * The OLD test-call endpoint was a false positive — it called the contractor's
 * owner_phone FROM their own BellAveGo number. That tested outbound voice, not
 * actual carrier-side conditional call forwarding.
 *
 * Real test: call FROM the BellAveGo office line (TWILIO_PHONE_NUMBER) TO the
 * contractor's existing business cell. The TwiML pauses ~35 seconds so the
 * contractor's carrier has time to fire its no-answer-forward rule, which
 * routes the call to the contractor's BellAveGo Twilio number. The voice route
 * detects this (from === TWILIO_PHONE_NUMBER + recent forwarding_test_started_at)
 * and stamps profiles.forwarding_verified_at. The UI polls /api/profile.
 *
 * If the contractor picks up before the carrier forwards (i.e. forwarding NOT
 * working), the call connects normally and voice route never fires. We time out
 * after 90s.
 */
export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, owner_phone, twilio_number, business_name')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile?.owner_phone) {
    return NextResponse.json({ error: 'No owner phone on profile' }, { status: 400 })
  }
  if (!profile.twilio_number) {
    return NextResponse.json({ error: 'BellAveGo number not provisioned yet' }, { status: 400 })
  }
  if (!process.env.TWILIO_PHONE_NUMBER) {
    return NextResponse.json({ error: 'TWILIO_PHONE_NUMBER env var not set' }, { status: 500 })
  }

  // Stamp the test-start so the voice route can correlate inbound forwarded calls.
  await supabase
    .from('profiles')
    .update({
      forwarding_test_started_at: new Date().toISOString(),
      forwarding_verified_at: null,  // clear any prior verification so the UI only sees the new one
    })
    .eq('user_id', userId)

  // 35 sec pause = enough room for carrier no-answer-forward (typically ~12s
  // ring + carrier delay) plus a buffer. Hangup at the end either way.
  const twimlText = '<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="35"/><Hangup/></Response>'

  try {
    const call = await twilioClient.calls.create({
      from: process.env.TWILIO_PHONE_NUMBER,  // BellAveGo office line, NOT the customer's own AI number
      to: profile.owner_phone,
      twiml: twimlText,
      timeout: 30,  // ring for 30s before treating as no-answer
    })
    return NextResponse.json({ ok: true, callSid: call.sid })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
