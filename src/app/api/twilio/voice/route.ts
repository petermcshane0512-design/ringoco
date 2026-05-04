import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const client = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

const conversations = new Map<string, Array<{ role: 'user' | 'assistant', content: string }>>()

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const callSid = formData.get('CallSid') as string
  const callerPhone = formData.get('From') as string
  const speechResult = formData.get('SpeechResult') as string

  const VoiceResponse = (await import('twilio')).twiml.VoiceResponse
  const twiml = new VoiceResponse()

  if (!speechResult) {
    const gather = twiml.gather({
      input: ['speech'],
      action: `/api/twilio/voice`,
      method: 'POST',
      speechTimeout: 'auto',
      language: 'en-US',
    })
    gather.say(
      { voice: 'Polly.Joanna' },
      "Hi, thanks for calling. I'm the virtual assistant. How can I help you today?"
    )
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  if (!conversations.has(callSid)) {
    conversations.set(callSid, [])
  }
  const history = conversations.get(callSid)!
  history.push({ role: 'user', content: speechResult })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: `You are a friendly phone receptionist for a home service business. Your job is to:
1. Get the caller's name
2. Get their callback number
3. Find out what service they need (HVAC, plumbing, electrical, etc)
4. Get their address
5. Ask for their preferred day and time
6. Tell them: "Perfect, I've got all your details. The owner will review your request and text you a confirmation within the hour."

Keep responses under 40 words. You are speaking out loud.
When you have all 5 pieces of info — end with: BOOKING_COMPLETE: name=[name], phone=[phone], service=[service], address=[address], time=[time]
Do not say BOOKING_COMPLETE out loud.
Do NOT tell the customer they are booked or confirmed. Only say the owner will confirm shortly.`,
    messages: history,
  })

  const aiText = response.content[0].type === 'text' ? response.content[0].text : ''
  const bookingMatch = aiText.match(/BOOKING_COMPLETE: name=(.+), phone=(.+), service=(.+), address=(.+), time=(.+)/)
  const spokenText = aiText.replace(/BOOKING_COMPLETE:.*$/, '').trim()

  history.push({ role: 'assistant', content: spokenText })

  if (bookingMatch) {
    const [, name, phone, service, address, time] = bookingMatch

    // Save job as pending_approval
    const { data: job, error } = await supabase.from('jobs').insert({
      user_id: 'system',
      customer_name: name,
      customer_phone: phone || callerPhone,
      job_type: service,
      address: address,
      scheduled_time: time,
      title: `${service} - ${name}`,
      status: 'pending_approval',
    }).select().single()

    if (error) console.error('Supabase error:', error)

    const jobId = job?.id

    // SMS to contractor with approve/decline instructions
    try {
      await twilioClient.messages.create({
        body: `🔔 New job request via BellAveGo!\n\n👤 Customer: ${name}\n📞 Phone: ${phone || callerPhone}\n🔧 Service: ${service}\n📍 Address: ${address}\n🕐 Requested time: ${time}\n\nReply YES to confirm or NO to decline.\nOr call the customer back at ${phone || callerPhone}.\n\nView at bellavego.com/dashboard`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: '+17737109565',
      })
    } catch (smsError) {
      console.error('SMS error:', smsError)
    }

    // Text the customer letting them know we received their request
    try {
      await twilioClient.messages.create({
        body: `Hi ${name}, thanks for reaching out! We've received your request for ${service} at ${address} for ${time}. The owner will confirm your appointment shortly. We'll text you to confirm. - BellAveGo`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: phone || callerPhone,
      })
    } catch (smsError) {
      console.error('Customer SMS error:', smsError)
    }

    conversations.delete(callSid)
    twiml.say({ voice: 'Polly.Joanna' }, spokenText)
    twiml.hangup()
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const gather = twiml.gather({
    input: ['speech'],
    action: `/api/twilio/voice`,
    method: 'POST',
    speechTimeout: 'auto',
    language: 'en-US',
  })
  gather.say({ voice: 'Polly.Joanna' }, spokenText)

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}