import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()
const conversations = new Map<string, Array<{ role: 'user' | 'assistant', content: string }>>()

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const callSid = formData.get('CallSid') as string
  const callerPhone = formData.get('From') as string
  const speechResult = formData.get('SpeechResult') as string

  const VoiceResponse = (await import('twilio')).twiml.VoiceResponse
  const twiml = new VoiceResponse()

  // First call — greet the caller
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

  // Get or create conversation
  if (!conversations.has(callSid)) {
    conversations.set(callSid, [])
  }
  const history = conversations.get(callSid)!
  history.push({ role: 'user', content: speechResult })

  // Call Claude
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: `You are a friendly phone receptionist for an HVAC business. Your job is to:
1. Get the caller's name
2. Get their callback number
3. Find out what service they need
4. Tell them someone will call back within 2 hours

Keep responses under 40 words. You are speaking out loud.
When you have name, phone, and service — end with: BOOKING_COMPLETE: name=[name], phone=[phone], service=[service]
Do not say BOOKING_COMPLETE out loud.`,
    messages: history,
  })

  const aiText = response.content[0].type === 'text' ? response.content[0].text : ''
  const bookingMatch = aiText.match(/BOOKING_COMPLETE: name=(.+), phone=(.+), service=(.+)/)
  const spokenText = aiText.replace(/BOOKING_COMPLETE:.*$/, '').trim()

  history.push({ role: 'assistant', content: spokenText })

  if (bookingMatch) {
    const [, name, phone, service] = bookingMatch
    console.log(`New lead: ${name}, ${phone}, ${service}, caller: ${callerPhone}`)
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