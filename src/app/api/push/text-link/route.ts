import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

/**
 * Text the contractor's phone a link to /dashboard so they can install
 * the PWA + enable push notifications on their phone after enabling on
 * desktop. Closes the loop on the "I signed up on my laptop, how do I
 * get this on my phone?" question.
 *
 * Auth: Clerk session — sends only to the calling user's owner_phone.
 * Cannot text arbitrary numbers. SMS body is transactional (link to
 * their own account dashboard) so TCPA-safe.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  }

  // Optional override — body { phone } so the user can text a different
  // number than their stored owner_phone (e.g. owner has separate work phone).
  // Strict format validation to prevent abuse — must be E.164 starting with +1.
  let overridePhone: string | null = null
  try {
    const body = await req.json()
    const candidate = (body as { phone?: string }).phone
    if (candidate && /^\+1\d{10}$/.test(candidate.replace(/[\s\-()]/g, ''))) {
      overridePhone = candidate.replace(/[\s\-()]/g, '')
    }
  } catch {
    // Empty body is fine — use stored owner_phone
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('owner_phone, business_name, twilio_number')
    .eq('user_id', userId)
    .maybeSingle()

  const targetPhone = overridePhone || (profile as { owner_phone?: string } | null)?.owner_phone
  if (!targetPhone) {
    return NextResponse.json(
      { error: 'no phone on file — add your phone in settings first, or pass one in the body' },
      { status: 400 },
    )
  }

  const fromNumber =
    process.env.TWILIO_DEMO_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+16514677829'

  // Short, scannable SMS — opens dashboard in their phone's browser. Once
  // there, the dashboard's PushNotificationSetup component walks them
  // through Add-to-Home-Screen + enable.
  const body =
    `BellAveGo — open this on your phone to turn on lead alerts:\n` +
    `https://www.bellavego.com/dashboard?utm_source=push_handoff\n\n` +
    `Reply STOP to opt out.`

  try {
    await twilioClient.messages.create({
      body,
      from: fromNumber,
      to: targetPhone,
    })
  } catch (e) {
    const err = e as { code?: number; message?: string }
    // During A2P 10DLC registration, carriers may block transactional SMS
    // from unregistered numbers (error 30034). Surface this honestly so
    // the UI can fall back to "copy link manually" instead of pretending
    // the text was sent.
    if (err.code === 30034) {
      return NextResponse.json(
        {
          error:
            'SMS temporarily blocked by carrier while our A2P registration finishes (1-2 weeks). Copy the link manually: https://www.bellavego.com/dashboard',
          code: 30034,
        },
        { status: 503 },
      )
    }
    console.error('push/text-link: Twilio send failed', err)
    return NextResponse.json({ error: err.message || 'SMS send failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sent_to: targetPhone })
}
