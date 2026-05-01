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
5. Ask for a preferred day and time
6. Tell them they are booked and someone will confirm shortly

Keep responses under 40 words. You are speaking out loud.
When you have all 5 pieces of info — end with: BOOKING_COMPLETE: name=[name], phone=[phone], service=[service], address=[address], time=[time]
Do not say BOOKING_COMPLETE out loud.`,
    messages: history,
  })

  const aiText = response.content[0].type === 'text' ? response.content[0].text : ''
  const bookingMatch = aiText.match(/BOOKING_COMPLETE: name=(.+), phone=(.+), service=(.+), address=(.+), time=(.+)/)
  const spokenText = aiText.replace(/BOOKING_COMPLETE:.*$/, '').trim()

  history.push({ role: 'assistant', content: spokenText })

  if (bookingMatch) {
    const [, name, phone, service, address, time] = bookingMatch

    const { error } = await supabase.from('jobs').insert({
      user_id: 'system',
      customer_name: name,
      customer_phone: phone || callerPhone,
      job_type: service,
      address: address,
      scheduled_time: time,
      title: `${service} - ${name}`,
      status: 'pending',
    })

    if (error) console.error('Supabase error:', error)

    try {
      await twilioClient.messages.create({
        body: `🔔 New job booked via BellAveGo!\n\nCustomer: ${name}\nPhone: ${phone || callerPhone}\nService: ${service}\nAddress: ${address}\nTime: ${time}\n\nLog in at bellavego.com to view.`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: '+17737109565',
      })
    } catch (smsError) {
      console.error('SMS error:', smsError)
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