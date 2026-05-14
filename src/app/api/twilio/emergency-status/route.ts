import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

/**
 * Twilio status callback for the emergency-escalation outbound call.
 *
 * Fires for completed / no-answer / busy / failed events. If the contractor
 * didn't pick up (no-answer, busy, failed), send a fallback SMS to the
 * backup_owner_phone (or FALLBACK_OWNER_PHONE = Peter) with the emergency
 * details so the lead doesn't die.
 *
 * Called by Twilio with form-encoded body: CallSid, CallStatus, To, From, etc.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const params: Record<string, string> = {}
  formData.forEach((v, k) => { params[k] = v as string })

  // Verify Twilio signature
  const twilioSignature = req.headers.get('x-twilio-signature') || ''
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host') || ''
  const url = req.url || `${proto}://${host}/api/twilio/emergency-status`
  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    twilioSignature,
    url,
    params,
  )
  if (!isValid) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const callStatus = params['CallStatus'] || ''
  const callSid = params['CallSid'] || ''
  const searchParams = req.nextUrl.searchParams
  const jobId = searchParams.get('job_id') || ''
  const userId = searchParams.get('user_id') || ''
  const fromNumber = searchParams.get('from') || process.env.TWILIO_PHONE_NUMBER!

  // Only act on definitive failure-to-reach states
  if (!['no-answer', 'busy', 'failed'].includes(callStatus)) {
    return NextResponse.json({ ok: true, ignored: callStatus })
  }

  if (!jobId || !userId) {
    return NextResponse.json({ ok: true, note: 'missing job/user context' })
  }

  // Pull the job + the customer's profile (for backup_owner_phone)
  const { data: job } = await supabase
    .from('jobs')
    .select('id, customer_name, customer_phone, job_type, user_id, emergency_fallback_sent_at')
    .eq('id', jobId)
    .maybeSingle()

  if (!job) return NextResponse.json({ ok: true, note: 'job missing' })
  if (job.emergency_fallback_sent_at) {
    // Already sent fallback — Twilio sometimes fires multiple status callbacks
    return NextResponse.json({ ok: true, already_sent: true })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name, owner_phone, backup_owner_phone, twilio_number')
    .eq('user_id', userId)
    .maybeSingle()

  // Choose fallback target: backup_owner_phone if set, else Peter (FALLBACK_OWNER_PHONE)
  const backupPhone =
    (profile as { backup_owner_phone?: string } | null)?.backup_owner_phone ??
    process.env.FALLBACK_OWNER_PHONE

  if (!backupPhone) {
    return NextResponse.json({ ok: true, note: 'no backup target configured' })
  }

  // Don't text the same number we just tried to call
  if (backupPhone === profile?.owner_phone) {
    return NextResponse.json({ ok: true, note: 'backup same as owner' })
  }

  const businessName = profile?.business_name || 'a BellAveGo customer'
  const sendFrom = profile?.twilio_number || fromNumber

  try {
    await twilioClient.messages.create({
      body:
        `🚨 EMERGENCY ESCALATION — ${businessName}\n\n` +
        `Contractor didn't pick up (${callStatus}). Customer needs help NOW:\n\n` +
        `👤 ${job.customer_name}\n` +
        `📞 ${job.customer_phone}\n` +
        `💬 ${job.job_type}\n\n` +
        `Call them. (Original call SID: ${callSid})`,
      from: sendFrom,
      to: backupPhone,
    })

    await supabase
      .from('jobs')
      .update({ emergency_fallback_sent_at: new Date().toISOString() })
      .eq('id', jobId)

    return NextResponse.json({ ok: true, fallback_sent_to: backupPhone })
  } catch (e) {
    console.error('emergency fallback SMS failed:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
