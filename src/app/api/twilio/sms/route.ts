import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const params: Record<string, string> = {}
  formData.forEach((value, key) => { params[key] = value as string })

  // Validate request is genuinely from Twilio
  const twilioSignature = req.headers.get('x-twilio-signature') || ''
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host') || ''
  const url = `${proto}://${host}/api/twilio/sms`
  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    twilioSignature,
    url,
    params
  )
  if (!isValid) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const body = params['Body']?.trim().toUpperCase()
  const from = params['From']
  const to = params['To'] // contractor's Twilio number that received the SMS

  // Look up contractor by the Twilio number that received the message
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('twilio_number', to)
    .single()

  if (!profile) {
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Only process replies from this contractor's registered phone
  if (from !== profile.owner_phone) {
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Get most recent pending job for THIS contractor only
  const { data: job } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'pending_approval')
    .eq('user_id', profile.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!job) {
    await twilioClient.messages.create({
      body: 'No pending job requests found.',
      from: to,
      to: profile.owner_phone,
    })
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const businessName = profile.business_name || 'BellAveGo'

  if (body === 'YES') {
    await supabase.from('jobs').update({ status: 'scheduled' }).eq('id', job.id)

    await twilioClient.messages.create({
      body: `Hi ${job.customer_name}! Your appointment for ${job.job_type} at ${job.address} on ${job.scheduled_time} is confirmed. We look forward to seeing you. - ${businessName}`,
      from: to,
      to: job.customer_phone,
    })

    await twilioClient.messages.create({
      body: `✅ Confirmed! ${job.customer_name} has been texted their confirmation.`,
      from: to,
      to: profile.owner_phone,
    })
  } else if (body === 'NO') {
    await supabase.from('jobs').update({ status: 'cancelled' }).eq('id', job.id)

    await twilioClient.messages.create({
      body: `Hi ${job.customer_name}, unfortunately we're not available at ${job.scheduled_time}. Please call us back to find a better time. - ${businessName}`,
      from: to,
      to: job.customer_phone,
    })

    await twilioClient.messages.create({
      body: `❌ Declined. ${job.customer_name} has been notified to call back and reschedule.`,
      from: to,
      to: profile.owner_phone,
    })
  }

  return new NextResponse('<?xml version="1.0"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
