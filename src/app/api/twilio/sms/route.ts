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
  const body = (formData.get('Body') as string)?.trim().toUpperCase()
  const from = formData.get('From') as string

  // Only process replies from the contractor's number
  if (from !== '+17737109565') {
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Get the most recent pending_approval job
  const { data: job } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!job) {
    await twilioClient.messages.create({
      body: 'No pending job requests found.',
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: '+17737109565',
    })
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  if (body === 'YES') {
    // Update job to scheduled
    await supabase
      .from('jobs')
      .update({ status: 'scheduled' })
      .eq('id', job.id)

    // Text the customer confirmation
    await twilioClient.messages.create({
      body: `Hi ${job.customer_name}! Your appointment for ${job.job_type} at ${job.address} on ${job.scheduled_time} is confirmed! We look forward to seeing you. - BellAveGo`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: job.customer_phone,
    })

    // Confirm back to contractor
    await twilioClient.messages.create({
      body: `✅ Job confirmed! Customer ${job.customer_name} has been texted their confirmation.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: '+17737109565',
    })

  } else if (body === 'NO') {
    // Update job to cancelled
    await supabase
      .from('jobs')
      .update({ status: 'cancelled' })
      .eq('id', job.id)

    // Text the customer that we need to reschedule
    await twilioClient.messages.create({
      body: `Hi ${job.customer_name}, unfortunately we're not available at ${job.scheduled_time}. Please call us back at ${process.env.TWILIO_PHONE_NUMBER} to find a better time. Sorry for the inconvenience! - BellAveGo`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: job.customer_phone,
    })

    // Confirm back to contractor
    await twilioClient.messages.create({
      body: `❌ Job declined. Customer ${job.customer_name} has been notified to call back and reschedule.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: '+17737109565',
    })
  }

  return new NextResponse('<?xml version="1.0"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}