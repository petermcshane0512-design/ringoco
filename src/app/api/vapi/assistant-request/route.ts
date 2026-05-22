import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { RECEPTIONIST_TIERS, RECEPTIONIST_CALL_CAP } from '@/lib/pricing'
import {
  renderSystemPrompt,
  renderSalesAgentPrompt,
  verifyVapiSignature,
  VAPI_VOICE_PROVIDER,
  VAPI_VOICE_ID_DEFAULT,
  getAiNameForVoice,
  type TenantContext,
} from '@/lib/vapi'
import { hasCalendarConnected } from '@/lib/calendar/availability'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Vapi calls this on every inbound call to a number imported under our account.
 * Event type: "assistant-request". Vapi sends us the called number and expects
 * us to respond with the per-tenant assistant overrides (system prompt with
 * their business name + services, voice tweaks if any, metadata so the
 * end-of-call webhook knows which tenant the call belonged to).
 *
 * Tenant lookup: profiles.twilio_number == call.customer.number (the called
 * Twilio number). Multi-tenant safety: same pattern as the legacy /api/twilio/voice
 * route — service-role read, .eq('twilio_number', ...) filter, no RLS.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!(await verifyVapiSignature(raw, req.headers))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: VapiAssistantRequest
  try {
    payload = JSON.parse(raw) as VapiAssistantRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const msg = payload.message
  if (msg?.type !== 'assistant-request') {
    // Not the event we handle here. Acknowledge so Vapi doesn't retry.
    return NextResponse.json({ ok: true })
  }

  // Vapi puts the inbound call data under message.call.
  // The number the homeowner dialed (our customer's BellAveGo number) is on
  // message.call.phoneNumber.number (for imported numbers) or message.call.customer.number.
  const calledNumber =
    msg.call?.phoneNumber?.number ??
    msg.call?.customer?.number ??
    null
  if (!calledNumber) {
    return NextResponse.json({ error: 'No called number in payload' }, { status: 400 })
  }

  // The caller's phone (homeowner dialing in normally, OR our office line if
  // this is a forwarding-verification test call). On Vapi imported numbers
  // the caller is on message.call.customer.number.
  const callerNumber = msg.call?.customer?.number ?? null

  // ── Public landing-page demo number ──
  // Emma — BellAveGo's AI sales receptionist. Answers prospect questions about
  // the product accurately AND demonstrates the AI quality they'd get if they
  // signed up (the conversation IS the product demo). Captures lead → on
  // take_message, end-of-call-report SMSes Peter directly with the lead info.
  if (process.env.TWILIO_DEMO_NUMBER && calledNumber === process.env.TWILIO_DEMO_NUMBER) {
    return NextResponse.json({
      assistantOverrides: {
        firstMessage: `Hi, this is Emma with BellAveGo. I know you're checking out our AI receptionist for home-service businesses — how can I help?`,
        model: {
          // Higher maxTokens so Emma can actually explain pricing + handle
          // objections in natural sentences. Base config uses 220 already
          // but we set explicitly here so any future base lower won't choke her.
          maxTokens: 260,
          temperature: 0.6,
          messages: [{ role: 'system', content: renderSalesAgentPrompt() }],
        },
        voice: {
          provider: VAPI_VOICE_PROVIDER,
          voiceId: process.env.VAPI_VOICE_ID || VAPI_VOICE_ID_DEFAULT,
        },
        metadata: {
          user_id: 'demo',
          business_name: 'BellAveGo (sales)',
          plan_tier: 'demo',
          twilio_number: calledNumber,
          is_demo: true,
        },
      },
    })
  }

  // Look up the tenant
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'user_id, business_name, owner_first_name, owner_phone, services, service_area, ai_tone, ai_language, ai_voice_id, backup_owner_phone, custom_prompt_notes, plan_tier, is_active, twilio_number, forwarding_test_started_at, auto_booking_enabled, auto_booking_min_hour, auto_booking_max_hour',
    )
    .eq('twilio_number', calledNumber)
    .maybeSingle()

  // ── Forwarding verification handshake ──
  // If the inbound call to a tenant's BellAveGo number is FROM our office line
  // (TWILIO_PHONE_NUMBER) AND we recently started a forwarding test for this
  // tenant, the carrier no-answer-forward fired correctly. Stamp verified and
  // tell Vapi to terminate immediately — no conversation, no minutes burned.
  if (
    profile &&
    process.env.TWILIO_PHONE_NUMBER &&
    callerNumber === process.env.TWILIO_PHONE_NUMBER
  ) {
    const startedAt = (profile as { forwarding_test_started_at?: string | null }).forwarding_test_started_at
      ? new Date((profile as { forwarding_test_started_at: string }).forwarding_test_started_at).getTime()
      : 0
    const within90s = startedAt > 0 && Date.now() - startedAt < 90_000
    if (within90s) {
      try {
        await supabase
          .from('profiles')
          .update({ forwarding_verified_at: new Date().toISOString() })
          .eq('user_id', profile.user_id)
      } catch (e) {
        console.error('vapi forwarding_verified_at stamp failed:', e)
      }
      return NextResponse.json({
        assistantOverrides: {
          firstMessage: '',
          endCallMessage: '',
          endCallFunctionEnabled: false,
          maxDurationSeconds: 1,
          silenceTimeoutSeconds: 1,
        },
      })
    }
  }

  if (!profile) {
    // Unknown number — let Vapi play its default and hang up. We shouldn't
    // be importing numbers we don't own.
    return NextResponse.json({
      assistantOverrides: {
        firstMessage:
          "Sorry, this line isn't configured yet. Please try again later.",
        endCallMessage: 'Goodbye.',
        endCallFunctionEnabled: false,
        silenceTimeoutSeconds: 8,
      },
    })
  }

  // Account suspension guard — paid before, payment lapsed
  if (profile.is_active === false) {
    return NextResponse.json({
      assistantOverrides: {
        firstMessage: `Hi, thanks for calling ${profile.business_name || 'us'}. Our automated service is temporarily paused. For urgent matters, please leave a message and we'll get back to you. Thanks for your patience.`,
        endCallMessage: 'Goodbye.',
        endCallFunctionEnabled: false,
        maxDurationSeconds: 30,
      },
    })
  }

  // Receptionist tier monthly call cap
  if (RECEPTIONIST_TIERS.has(profile.plan_tier ?? '')) {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.user_id)
      .gte('created_at', monthStart.toISOString())
    if ((count ?? 0) >= RECEPTIONIST_CALL_CAP) {
      return NextResponse.json({
        assistantOverrides: {
          firstMessage: `Hi, thanks for calling ${profile.business_name || 'us'}. We've reached our call capacity for this month. Please call back next month, or text us if it's urgent. Thank you.`,
          endCallMessage: 'Goodbye.',
          endCallFunctionEnabled: false,
          maxDurationSeconds: 30,
        },
      })
    }
  }

  // Calendar-mode is layered: the AI only switches into book-appointments
  // mode when BOTH (a) a calendar is actually connected AND (b) the
  // contractor has opted into AI-initiated bookings via the
  // auto_booking_enabled flag. A connected calendar without the flag means
  // the contractor uses it for their own visibility but doesn't want the
  // AI to write to it — Emma stays in take-message mode.
  const autoBookingEnabled =
    (profile as { auto_booking_enabled?: boolean | null }).auto_booking_enabled === true
  const calendarConnected = autoBookingEnabled
    ? await hasCalendarConnected(profile.user_id).catch(() => false)
    : false

  // Resolve the voice ID first — it drives the AI's spoken name. A male
  // voice introducing himself as "Emma" was the bug we're fixing here.
  // getAiNameForVoice maps the contractor's chosen Cartesia voice to a
  // sensible default name (Helpful Woman → Emma, Newslady → Avery,
  // Friendly Man → Marcus). Unknown voice IDs fall back to "Emma".
  const resolvedVoiceId =
    (profile as { ai_voice_id?: string | null }).ai_voice_id ||
    process.env.VAPI_VOICE_ID ||
    VAPI_VOICE_ID_DEFAULT
  const aiName = getAiNameForVoice(resolvedVoiceId)

  // Build the per-tenant override
  const tenant: TenantContext = {
    userId: profile.user_id,
    businessName: profile.business_name ?? 'the business',
    ownerFirstName: profile.owner_first_name,
    services: profile.services,
    serviceArea: profile.service_area,
    aiTone: profile.ai_tone,
    aiLanguage: profile.ai_language,
    customPromptNotes: (profile as { custom_prompt_notes?: string | null }).custom_prompt_notes,
    planTier: profile.plan_tier,
    twilioNumber: profile.twilio_number,
    aiName,
    hasCalendarConnected: calendarConnected,
  }

  const firstMessage =
    tenant.aiLanguage === 'es'
      ? `Hola, soy ${aiName} con ${tenant.businessName}. ${tenant.ownerFirstName || 'El dueño'} está en un trabajo — ¿en qué le puedo ayudar?`
      : `Hi, this is ${aiName} with ${tenant.businessName}. ${tenant.ownerFirstName || 'The owner'} is out on a job — how can I help?`

  return NextResponse.json({
    assistantOverrides: {
      firstMessage,
      model: {
        // Bumped maxTokens so the AI has room for natural responses — the
        // base Vapi assistant was created with 90 which forces choppy/robotic
        // replies. Per-call override here means we don't need to re-deploy
        // the base assistant.
        maxTokens: 220,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content: renderSystemPrompt(tenant),
          },
        ],
      },
      voice: {
        provider: VAPI_VOICE_PROVIDER,
        voiceId: resolvedVoiceId,
      },
      // Metadata travels to the end-of-call-report webhook so we know which
      // tenant the call belonged to without a second DB lookup.
      metadata: {
        user_id: tenant.userId,
        business_name: tenant.businessName,
        plan_tier: tenant.planTier,
        twilio_number: tenant.twilioNumber,
        owner_phone: profile.owner_phone,
        backup_owner_phone: (profile as { backup_owner_phone?: string | null }).backup_owner_phone || null,
      },
    },
  })
}

// ── Types (narrow shape of the payload we care about) ──────────
type VapiAssistantRequest = {
  message?: {
    type: 'assistant-request' | string
    call?: {
      id?: string
      phoneNumber?: { number?: string }
      customer?: { number?: string }
    }
  }
}
