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

type Turn = { role: 'user' | 'assistant', content: string }

// Per-instance fallback for cold-state failures (e.g. table missing post-deploy).
// Real durability comes from the call_state table — see migrations/002.
const memCache = new Map<string, Turn[]>()

async function getHistory(callSid: string): Promise<Turn[]> {
  try {
    const { data, error } = await supabase
      .from('call_state')
      .select('history')
      .eq('call_sid', callSid)
      .maybeSingle()
    if (error) throw error
    if (data?.history) return data.history as Turn[]
  } catch (e) {
    console.error('call_state read failed, using memCache:', e)
  }
  return memCache.get(callSid) ?? []
}

async function setHistory(callSid: string, history: Turn[], profileId?: string) {
  memCache.set(callSid, history)
  try {
    await supabase
      .from('call_state')
      .upsert({
        call_sid: callSid,
        history,
        profile_id: profileId,
        updated_at: new Date().toISOString(),
      })
  } catch (e) {
    console.error('call_state write failed, memCache only:', e)
  }
}

async function clearHistory(callSid: string) {
  memCache.delete(callSid)
  try {
    await supabase.from('call_state').delete().eq('call_sid', callSid)
  } catch (e) {
    console.error('call_state delete failed:', e)
  }
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(your\s+)?(previous\s+)?instructions/i,
  /forget\s+(you\s+are|you're|your\s+role)/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions:/i,
  /system\s+prompt/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /disregard\s+(all\s+)?previous/i,
  /override\s+(your\s+)?instructions/i,
]

function isSafeInput(text: string): boolean {
  return !INJECTION_PATTERNS.some(pattern => pattern.test(text))
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const params: Record<string, string> = {}
  formData.forEach((value, key) => { params[key] = value as string })

  // Validate request is genuinely from Twilio
  const twilioSignature = req.headers.get('x-twilio-signature') || ''
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host') || ''
  const url = `${proto}://${host}/api/twilio/voice`
  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    twilioSignature,
    url,
    params
  )
  if (!isValid) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const callSid = params['CallSid']
  const callerPhone = params['From']
  const speechResult = params['SpeechResult']
  const calledNumber = params['To']

  // Public landing-page demo number: hardcoded fictional profile, no DB writes,
  // no contractor SMS — just the conversation + caller confirmation SMS so prospects
  // see the booking flow live.
  const isDemo = !!process.env.TWILIO_DEMO_NUMBER && calledNumber === process.env.TWILIO_DEMO_NUMBER

  type Profile = {
    user_id?: string
    business_name?: string
    owner_phone?: string
    services?: string
    service_area?: string
    ai_tone?: string
  }

  let profile: Profile | null = null
  if (isDemo) {
    profile = {
      business_name: 'Smith HVAC & Plumbing',
      services: 'HVAC, plumbing, water heater installs, drain cleaning',
      service_area: 'metro Atlanta',
      ai_tone: 'friendly',
      owner_phone: process.env.FALLBACK_OWNER_PHONE!,
    }
  } else {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('twilio_number', calledNumber)
      .maybeSingle()
    profile = data
  }

  const businessName = profile?.business_name || 'the business'
  const ownerPhone = profile?.owner_phone || process.env.FALLBACK_OWNER_PHONE!
  const services = profile?.services || 'home services'
  const serviceArea = profile?.service_area || 'the local area'
  const aiTone = profile?.ai_tone || 'friendly'

  // ── Account suspension guard ──
  // Customer had service active (has a provisioned BellAveGo number) but their
  // subscription is no longer active (Stripe payment failure or cancellation).
  // Don't burn Claude/Twilio minutes — play a polite "paused" message + hangup.
  // Demo number is exempt.
  const profileWithStatus = profile as (typeof profile & { is_active?: boolean; twilio_number?: string }) | null
  if (!isDemo && profileWithStatus && profileWithStatus.twilio_number && profileWithStatus.is_active === false) {
    const VR = (await import('twilio')).twiml.VoiceResponse
    const suspended = new VR()
    suspended.say(
      { voice: 'Polly.Joanna-Neural' },
      `Hi, thanks for calling ${businessName}. Our automated service is temporarily paused. For urgent matters, please reach out directly at ${ownerPhone}. Thanks for your patience.`
    )
    suspended.hangup()
    return new NextResponse(suspended.toString(), { headers: { 'Content-Type': 'text/xml' } })
  }
  const profileWithLang = profile as (typeof profile & { ai_language?: string }) | null
  const aiLang = (profileWithLang?.ai_language === 'es' ? 'es' : 'en') as 'en' | 'es'
  const voiceName = aiLang === 'es' ? 'Polly.Lupe-Neural' : 'Polly.Joanna-Neural'
  const speechLang = aiLang === 'es' ? 'es-US' : 'en-US'

  // ── Receptionist tier: cap at 50 calls received per calendar month ──
  // (Includes legacy 'foundation' tier customers from earlier pricing.)
  // Demo number is exempt (always full experience for prospects).
  const profileWithTier = profile as (typeof profile & { plan_tier?: string; user_id?: string }) | null
  const cappedTiers = new Set(['receptionist', 'foundation'])  // foundation = legacy v3
  const RECEPTIONIST_CALL_CAP = 50
  if (!isDemo && cappedTiers.has(profileWithTier?.plan_tier ?? '') && profileWithTier?.user_id) {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    // Count distinct calls received this month (call_logs.call_sid is the inception marker
    // we insert for every call below). Falls back to jobs count if call_logs is empty.
    const { count } = await supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profileWithTier.user_id)
      .gte('created_at', monthStart.toISOString())
    if ((count ?? 0) >= RECEPTIONIST_CALL_CAP) {
      const VR = (await import('twilio')).twiml.VoiceResponse
      const capTwiml = new VR()
      capTwiml.say(
        { voice: voiceName },
        aiLang === 'es'
          ? `Hola, gracias por llamar a ${businessName}. Hemos atendido el máximo de llamadas de este mes — por favor llame el próximo mes, o envíe un mensaje de texto a ${ownerPhone} si es urgente. ¡Gracias!`
          : `Hi, thanks for calling ${businessName}. We've reached our call capacity for this month — please call back next month, or text ${ownerPhone} if it's urgent. Thank you!`
      )
      capTwiml.hangup()
      return new NextResponse(capTwiml.toString(), { headers: { 'Content-Type': 'text/xml' } })
    }
  }

  const toneInstruction =
    aiTone === 'professional'
      ? 'Use a polished, formal tone.'
      : aiTone === 'concise'
      ? 'Be extremely brief and direct. No small talk.'
      : 'Be warm and conversational.'

  const VoiceResponse = (await import('twilio')).twiml.VoiceResponse
  const twiml = new VoiceResponse()

  // ── Insert call_log at call inception (before any speech).
  // This is what powers the Receptionist call cap above and gives us
  // "calls received this month" instead of just "jobs booked." Idempotent on call_sid.
  if (!isDemo && profileWithTier?.user_id && callSid && !speechResult) {
    try {
      await supabase.from('call_logs').upsert(
        {
          user_id: profileWithTier.user_id,
          profile_id: profileWithTier.user_id,
          call_sid: callSid,
          caller_phone: callerPhone,
          job_created: false,
          booking_completed: false,
        },
        { onConflict: 'call_sid', ignoreDuplicates: true }
      )
    } catch (e) {
      console.error('call_logs inception insert failed:', e)
    }
  }

  if (!speechResult) {
    const gather = twiml.gather({
      input: ['speech'],
      action: `/api/twilio/voice`,
      method: 'POST',
      speechTimeout: 'auto',
      speechModel: 'phone_call',
      enhanced: true,
      language: speechLang,
    })
    gather.say(
      { voice: voiceName },
      aiLang === 'es'
        ? `Hola, gracias por llamar a ${businessName}. Soy la asistente virtual. ¿En qué le puedo ayudar hoy?`
        : `Thanks for calling ${businessName}. What's going on — what can we help you with today?`
    )
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Block prompt injection attempts — redirect caller naturally
  if (!isSafeInput(speechResult)) {
    const gather = twiml.gather({
      input: ['speech'],
      action: `/api/twilio/voice`,
      method: 'POST',
      speechTimeout: 'auto',
      speechModel: 'phone_call',
      enhanced: true,
      language: speechLang,
    })
    gather.say(
      { voice: voiceName },
      aiLang === 'es'
        ? `Disculpe, no le entendí bien. ¿Me puede dar su nombre y qué servicio necesita?`
        : `I didn't quite catch that. Could you tell me your name and what service you need today?`
    )
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const history = await getHistory(callSid)
  history.push({ role: 'user', content: speechResult })

  let aiText = ''
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 220,
      system: `${aiLang === 'es' ? 'Responde SOLO en español (español de México / EE. UU. Hispánico). Usa un tono natural y conversacional.\n\n' : ''}You are the AI phone receptionist for ${businessName} — a real home-service business serving ${serviceArea}. ${toneInstruction}

Services we offer: ${services}.

Your job: book a service call in 5 fields, in roughly this order:
1. Caller's first name
2. Best callback number
3. Which service they need — match it to one of our services above ("Sounds like an HVAC issue" / "That's a plumbing call")
4. Their address (street + city)
5. Preferred day and time window

Speak like a real receptionist. Conversational, confident, warm — not robotic.
Stay under 22 words per turn. Acknowledge what they said before asking the next question.
Examples of good turns:
  • "Got it — AC not cooling. Can I grab your name first?"
  • "Thanks Mike. What number's best to reach you on?"
  • "Perfect. What's the address we'd come out to?"
Never say "confirmed" — say "the owner will confirm shortly."

When all 5 fields collected, append on its own line at the very end:
BOOKING_COMPLETE: name=[X], phone=[X], service=[X], address=[X], time=[X]
Never speak the word BOOKING_COMPLETE aloud.

Only role: book a service call. Politely decline anything else: "I can only help schedule a service call — what's your name?"`,
      messages: history,
    })
    aiText = response.content[0].type === 'text' ? response.content[0].text : ''
  } catch (e) {
    console.error('Anthropic error:', e)
    // Graceful fallback so the call doesn't crash with "application error"
    const fallback = twiml.gather({
      input: ['speech'],
      action: `/api/twilio/voice`,
      method: 'POST',
      speechTimeout: 'auto',
      speechModel: 'phone_call',
      enhanced: true,
      language: speechLang,
    })
    fallback.say({ voice: voiceName }, `Sorry, I'm having a brief issue. Could you say that again?`)
    return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } })
  }
  const bookingMatch = aiText.match(/BOOKING_COMPLETE: name=(.+), phone=(.+), service=(.+), address=(.+), time=(.+)/)
  const spokenText = aiText.replace(/BOOKING_COMPLETE:.*$/, '').trim()

  history.push({ role: 'assistant', content: spokenText })

  if (bookingMatch) {
    const [, name, phone, service, address, time] = bookingMatch

    let job: { id?: string } | null = null

    if (!isDemo) {
      // Insert or find customer record
      let customerId: string | undefined
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', phone || callerPhone)
        .maybeSingle()
      if (existingCustomer) {
        customerId = existingCustomer.id
      } else {
        const { data: newCustomer } = await supabase.from('customers').insert({
          user_id: profile?.user_id || 'system',
          name,
          phone: phone || callerPhone,
          address,
        }).select('id').single()
        customerId = newCustomer?.id
      }

      const { data: jobRow } = await supabase.from('jobs').insert({
        user_id: profile?.user_id || 'system',
        customer_id: customerId,
        customer_name: name,
        customer_phone: phone || callerPhone,
        job_type: service,
        address: address,
        scheduled_time: time,
        title: `${service} - ${name}`,
        status: 'pending_approval',
      }).select().single()
      job = jobRow

      try {
        await twilioClient.messages.create({
          body: `🔔 New job request via BellAveGo!\n\n👤 Customer: ${name}\n📞 Phone: ${phone || callerPhone}\n🔧 Service: ${service}\n📍 Address: ${address}\n🕐 Requested time: ${time}\n\nReply YES to confirm or NO to decline.\n\nView at bellavego.com/dashboard`,
          from: calledNumber || process.env.TWILIO_PHONE_NUMBER!,
          to: ownerPhone,
        })
      } catch (smsError) {
        console.error('Contractor SMS error:', smsError)
      }
    }

    // Always send the caller confirmation — for demo callers, this is the WOW.
    try {
      const callerBody = isDemo
        ? `Hi ${name}! This is a BellAveGo demo from Smith HVAC & Plumbing. Your "${service}" booking at ${address} for ${time} was just captured by AI in under 60 seconds. Build this for your business → bellavego.com`
        : `Hi ${name}, thanks for reaching out to ${businessName}! We received your request for ${service} at ${address} for ${time}. The owner will confirm your appointment shortly. - ${businessName}`
      await twilioClient.messages.create({
        body: callerBody,
        from: calledNumber || process.env.TWILIO_PHONE_NUMBER!,
        to: phone || callerPhone,
      })
    } catch (smsError) {
      console.error('Customer SMS error:', smsError)
    }

    if (!isDemo) {
      // Upsert by call_sid — the inception row was inserted at first turn.
      // This finalizes it with booking details. If somehow no inception row exists
      // (legacy calls, race), upsert creates one.
      try {
        await supabase.from('call_logs').upsert(
          {
            user_id: profile?.user_id,
            profile_id: profile?.user_id,
            call_sid: callSid,
            caller_phone: callerPhone,
            job_type: service,
            transcript: JSON.stringify(history),
            job_created: true,
            booking_completed: true,
            hangup_turn: history.length,
            job_id: job?.id,
          },
          { onConflict: 'call_sid' }
        )
      } catch (e) {
        console.error('call_logs upsert failed:', e)
      }
    }

    await clearHistory(callSid)
    twiml.say({ voice: voiceName }, spokenText)
    twiml.hangup()
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  await setHistory(callSid, history, profile?.user_id)

  const gather = twiml.gather({
    input: ['speech'],
    action: `/api/twilio/voice`,
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    enhanced: true,
    language: 'en-US',
  })
  gather.say({ voice: voiceName }, spokenText)

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
