import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TIER_CALL_CAP } from '@/lib/pricing'
import {
  renderSystemPrompt,
  renderSalesAgentPrompt,
  VAPI_VOICE_PROVIDER,
  VAPI_VOICE_ID_DEFAULT,
  getAiNameForVoice,
  type TenantContext,
} from '@/lib/vapi'
import { hasCalendarConnected } from '@/lib/calendar/availability'
import { buildFirstMessage } from '@/lib/greeting'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * ⚠️ PARKED — NOT IN THE LIVE REQUEST PATH (2026-05-22)
 *
 * This route was designed to handle Vapi's `assistant-request` event:
 * Vapi POSTs here when an inbound call lands; we respond with per-call
 * `assistantOverrides` that personalize Emma for the tenant. The route
 * works (verified by curl: 200 OK with full payload, ~500ms response).
 *
 * BUT Vapi does not actually apply our response. After hours of debugging
 * we confirmed via Vapi's `/call` API that `call.assistantOverrides`
 * comes back empty on every inbound call — the override never reaches
 * the conversation. We tried every payload shape, both with and without
 * the phone number's `assistantId` bound, with and without signatures,
 * with and without the nested `server` object. Nothing convinced Vapi
 * to apply the override.
 *
 * We pivoted to a per-tenant assistant architecture: one Vapi assistant
 * per contractor, created at signup, with the personalized prompt baked
 * in directly. The contractor's phone number is bound to their assistant.
 * No webhook overrides needed. See:
 *
 *   docs/architecture/vapi-tenant-provisioning.md
 *   scripts/provision-tenant.mjs (skeleton)
 *
 * THIS ROUTE STAYS for three reasons:
 *   1. If Vapi fixes their override pipeline later, this is half the
 *      work to resume the simpler shared-assistant pattern.
 *   2. The tenant-lookup logic (Supabase query, fallback patterns,
 *      forwarding-verification handshake) is useful reference.
 *   3. The phone number's `serverUrl` still points here. Removing the
 *      route would leave it 404-ing — cheaper to leave it returning
 *      a benign 200 / {ok: true} for now.
 *
 * If you're reading this because Vapi changed something or you found
 * a way to make overrides apply: great, but also check what changed
 * in the per-tenant flow before re-wiring this back in. The two
 * patterns can coexist (tenants on their own assistants, demo line
 * on a shared one) but the demo line currently uses a BAKED prompt
 * (scripts/bake-sales-prompt-into-assistant.mjs) not a webhook
 * override.
 *
 * Original intent (kept for reference):
 *   Vapi calls this on every inbound call to a number imported under our
 *   account. Event type: "assistant-request". We respond with per-tenant
 *   assistant overrides — system prompt with their business name + services,
 *   voice tweaks, metadata for the end-of-call webhook.
 *
 *   Tenant lookup: profiles.twilio_number == call.customer.number. Multi-
 *   tenant safety: service-role read, .eq('twilio_number', ...) filter, no RLS.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()

  // ── SIGNATURE NOTE ──
  // Vapi's phone-number webhooks (assistant-request) do NOT support a
  // serverUrlSecret — verified May 2026 by PATCHing the phone number with
  // both flat (serverUrlSecret) and nested (server.secret) shapes; Vapi
  // accepts the field but persists nothing. So Vapi posts here unsigned
  // every time. Verifying breaks the demo line: every inbound call would
  // 401 → Vapi falls back to the base assistant config → Emma reads the
  // generic "take a message" fallback prompt instead of the per-tenant
  // override. Confirmed via /call API: every recent call had no override
  // applied.
  //
  // This route is effectively read-only (returns per-call AI config, no
  // DB writes), so dropping signature is an acceptable trade-off. Other
  // Vapi routes that DO write (end-of-call-report, calendar/book,
  // calendar/availability) still call verifyVapiSignature.
  //
  // Worst-case info leak from skipping: an attacker can POST a phone
  // number to confirm whether it's registered with BellAveGo. No write,
  // no exfiltration. The route already returns "isn't configured yet"
  // for unknown numbers, so attackers learn nothing beyond what they
  // could get from Twilio number ownership lookups.

  let payload: VapiAssistantRequest
  try {
    payload = JSON.parse(raw) as VapiAssistantRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // EPHEMERAL DEBUG LOGGING — capture exactly what Vapi sends so we can
  // see why the override was being silently dropped on the last 8+ calls.
  // Strip this once override application is verified in /call API.
  try {
    const dbgShape = {
      keys: Object.keys(payload || {}),
      message_keys: Object.keys((payload as { message?: unknown }).message || {}),
      message_type: (payload as { message?: { type?: string } }).message?.type,
      called_via_phoneNumber: (payload as { message?: { call?: { phoneNumber?: { number?: string } } } }).message?.call?.phoneNumber?.number,
      called_via_customer:    (payload as { message?: { call?: { customer?: { number?: string } } } }).message?.call?.customer?.number,
      env_TWILIO_DEMO_NUMBER_set: !!process.env.TWILIO_DEMO_NUMBER,
    }
    console.log('[vapi/assistant-request] incoming', JSON.stringify(dbgShape))
  } catch { /* never block on logging */ }

  const msg = payload.message

  // PERMISSIVE TYPE CHECK — Vapi may send "assistant-request" today, may
  // rename to "assistantRequest" or wrap differently tomorrow. If we have
  // a called-number we can resolve a tenant for, we return overrides
  // regardless of the literal type field. The cost of returning an
  // override on a non-assistant-request event is essentially zero (Vapi
  // ignores it). The cost of NOT returning one on the real event is
  // every demo call gets the base prompt — which is exactly the bug we
  // spent the last hour chasing.

  // Vapi puts the inbound call data under message.call. The number the
  // homeowner dialed (our customer's BellAveGo number) is on
  // message.call.phoneNumber.number for imported numbers, or sometimes
  // surfaced under message.call.customer.number on legacy shapes. We
  // also check a few additional locations seen in recent Vapi payload
  // mutations to future-proof against further drift.
  type LooseCall = {
    phoneNumber?: { number?: string; phoneNumber?: string }
    customer?: { number?: string }
    to?: string
    toNumber?: string
  }
  const call = (msg?.call ?? {}) as LooseCall
  const calledNumber =
    call.phoneNumber?.number ??
    call.phoneNumber?.phoneNumber ??
    call.to ??
    call.toNumber ??
    call.customer?.number ??
    null
  if (!calledNumber) {
    console.warn('[vapi/assistant-request] no called number in payload')
    return NextResponse.json({ ok: true })
  }

  // The caller's phone (homeowner dialing in normally, OR our office line if
  // this is a forwarding-verification test call). On Vapi imported numbers
  // the caller is on message.call.customer.number.
  const callerNumber = (call.customer?.number) ?? null

  // ── Public landing-page demo number ──
  // Emma — BellAveGo's AI sales receptionist. Answers prospect questions about
  // the product accurately AND demonstrates the AI quality they'd get if they
  // signed up (the conversation IS the product demo). Captures lead → on
  // take_message, end-of-call-report SMSes Peter directly with the lead info.
  //
  // Fallback: hardcoded literal +16514677829 catches the demo line even
  // when TWILIO_DEMO_NUMBER env var hasn't been set in production yet.
  // The env var lookup is preferred (configurable in dashboard) but we
  // never want a missing env to break the sales line.
  // Assistant ID — passed back in EVERY response so Vapi has the full
  // "use this assistant with these overrides" instruction even when the
  // phone number isn't bound. Hardcoded fallback because env may not be set.
  const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || 'cccc9db9-7a6b-4211-b6b1-a68de8e21458'

  const DEMO_NUMBER_FALLBACK = '+16514677829'
  if (calledNumber === (process.env.TWILIO_DEMO_NUMBER || DEMO_NUMBER_FALLBACK)) {
    console.log('[vapi/assistant-request] demo branch matched for', calledNumber)
    return NextResponse.json({
      // Returning assistantId alongside overrides gives Vapi the complete
      // "use this assistant + apply these overrides" instruction —
      // works whether or not the phone number has its own assistantId binding.
      assistantId: ASSISTANT_ID,
      assistantOverrides: {
        firstMessage: `Hey, this is Emma with Bell Ahva Go. Are you interested in hearing about our software, or how we're going to start answering your calls when you sign up?`,
        model: {
          // CLOSER MODE: shorter responses (160 max), lower temp for tighter
          // delivery. Peter 2026-06-03: demo line callers want sharp + fast,
          // not features-dump. Haiku is 3-5× faster than Sonnet — measurable
          // latency drop in Vapi pipeline. Quality is sufficient for the
          // 2-sentence-max prompt structure.
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          maxTokens: 160,
          temperature: 0.4,
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

  // Per-tier monthly call cap — Starter 60, Pro 300, Elite unlimited (see TIER_CALL_CAP).
  // Tiers with Infinity caps skip the check.
  const tierCap = TIER_CALL_CAP[profile.plan_tier ?? ''] ?? Number.POSITIVE_INFINITY
  if (Number.isFinite(tierCap)) {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.user_id)
      .gte('created_at', monthStart.toISOString())
    if ((count ?? 0) >= tierCap) {
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

  // Greeting style is set during onboarding (or later in /dashboard/settings).
  // Defaults to 'friendly_intro' which preserves the legacy "Hi, this is Emma
  // with {business}. {owner} is out on a job — how can I help?" line.
  const greetingProfile = profile as {
    ai_greeting_style?: string | null
    ai_greeting_custom?: string | null
  }
  const firstMessage = buildFirstMessage({
    businessName: tenant.businessName,
    ownerFirstName: tenant.ownerFirstName,
    aiName,
    style: greetingProfile.ai_greeting_style,
    customTemplate: greetingProfile.ai_greeting_custom,
    language: tenant.aiLanguage === 'es' ? 'es' : 'en',
  })

  return NextResponse.json({
    assistantId: ASSISTANT_ID,
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
