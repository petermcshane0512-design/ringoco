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
  const calledNumber = formData.get('To') as string

  // Look up which contractor owns this Twilio number
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('twilio_number', calledNumber)
    .single()

  // Fall back to defaults if no profile found yet
  const businessName = profile?.business_name || 'the business'
  const ownerPhone = profile?.owner_phone || '+17737109565'
  const services = profile?.services || 'HVAC, plumbing, and electrical'
  const serviceArea = profile?.service_area || 'the local area'
  const aiTone = profile?.ai_tone || 'friendly'

  const toneInstruction =
    aiTone === 'professional'
      ? 'Use a polished, formal tone.'
      : aiTone === 'concise'
      ? 'Be extremely brief and direct. No small talk.'
      : 'Be warm and conversational.'

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
      `Hi, thanks for calling ${businessName}. I'm the virtual assistant. How can I help you today?`
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
    system: `You are a phone receptionist for ${businessName}, a home service business.
${toneInstruction}
Services offered: ${services}.
Service area: ${serviceArea}.

Your job is to collect:
1. The caller's name
2. Their callback number
3. What service they need
4. Their address
5. Their preferred day and time

Keep responses under 40 words. You are speaking out loud on the phone.
When you have all 5 pieces of info — end your message with:
BOOKING_COMPLETE: name=[name], phone=[phone], service=[service], address=[address], time=[time]
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

    // Save job — link to the profile's user_id if we found one
    const { data: job, error } = await supabase.from('jobs').insert({
      user_id: profile?.user_id || 'system',
      customer_name: name,
      customer_phone: phone || callerPhone,
      job_type: service,
      address: address,
      scheduled_time: time,
      title: `${service} - ${name}`,
      status: 'pending_approval',
    }).select().single()

    if (error) console.error('Supabase error:', error)

    // SMS to the real owner cell — not hardcoded
    try {
      await twilioClient.messages.create({
        body: `🔔 New job request via BellAveGo!\n\n👤 Customer: ${name}\n📞 Phone: ${phone || callerPhone}\n🔧 Service: ${service}\n📍 Address: ${address}\n🕐 Requested time: ${time}\n\nReply YES to confirm or NO to decline.\nOr call the customer back at ${phone || callerPhone}.\n\nView at bellavego.com/dashboard`,
        from: calledNumber || process.env.TWILIO_PHONE_NUMBER!,
        to: ownerPhone,
      })
    } catch (smsError) {
      console.error('SMS error:', smsError)
    }

    // SMS to the customer
    try {
      await twilioClient.messages.create({
        body: `Hi ${name}, thanks for reaching out to ${businessName}! We've received your request for ${service} at ${address} for ${time}. The owner will confirm your appointment shortly. - ${businessName}`,
        from: calledNumber || process.env.TWILIO_PHONE_NUMBER!,
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