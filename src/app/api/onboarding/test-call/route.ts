import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://www.bellavego.com'

/**
 * Initiate an outbound test call FROM the customer's BellAveGo number TO their owner phone.
 * Used by the setup wizard to confirm Twilio + provisioning is live.
 *
 * The call plays a short verification message: "Hi! This is your BellAveGo AI receptionist
 * doing a test call. If you hear this, your number is live. Hang up when ready." Then ends.
 *
 * Records test_call_at timestamp on profile.
 */
export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('twilio_number, owner_phone, business_name')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile?.twilio_number) {
    return NextResponse.json({ error: 'No phone number provisioned yet' }, { status: 400 })
  }
  if (!profile.owner_phone) {
    return NextResponse.json({ error: 'No owner phone on file' }, { status: 400 })
  }

  // Use a TwiML Bin–style inline TwiML via the `twiml` parameter.
  const message = `Hi! This is your BellAveGo A I receptionist doing a quick test call. If you hear this, your number is live and forwarding from your business cell will land here. You're all set. Have a great day.`
  const twimlBody = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">${message}</Say><Hangup/></Response>`

  try {
    const call = await twilioClient.calls.create({
      from: profile.twilio_number,
      to: profile.owner_phone,
      twiml: twimlBody,
      timeout: 30,
      statusCallback: `${APP_URL}/api/onboarding/test-call/status`,
      statusCallbackEvent: ['completed', 'no-answer', 'failed'],
    })

    await supabase
      .from('profiles')
      .update({ test_call_at: new Date().toISOString() })
      .eq('user_id', userId)

    return NextResponse.json({ ok: true, callSid: call.sid })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('test call failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
