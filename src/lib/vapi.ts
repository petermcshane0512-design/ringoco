/**
 * Vapi integration — voice AI orchestration layer.
 *
 * Architecture: BYO Twilio. Customers' Twilio numbers are imported into Vapi
 * via /phone-number/import, so calls land on Twilio → are immediately handed
 * to Vapi → Vapi runs the conversation (Cartesia Sonic + Claude Sonnet 4.6 +
 * Deepgram Nova-3) → on book_appointment tool call, Vapi POSTs the structured
 * booking to /api/vapi/end-of-call-report → we run the existing post-call
 * flow (job insert, contractor YES/NO SMS, homeowner confirmation SMS,
 * call_logs, tier cap, smart insight for Office Mgr+).
 *
 * Multi-tenancy: ONE shared assistant ("BellAveGo Receptionist") in Vapi.
 * Per-call config is injected via assistantOverrides returned from
 * /api/vapi/assistant-request, looked up by the called Twilio number.
 */

const VAPI_API_BASE = 'https://api.vapi.ai'

export const VAPI_VOICE_PROVIDER = 'cartesia'
// Cartesia Sonic — warm professional female. Closest analog to current Polly Joanna.
// Voice ID can be swapped via VAPI_VOICE_ID env without code change.
export const VAPI_VOICE_ID_DEFAULT = '156fb8d2-335b-4950-9cb3-a2d33befec77' // Cartesia "Helpful Woman"
export const VAPI_MODEL_PROVIDER = 'anthropic'
export const VAPI_MODEL_DEFAULT = 'claude-sonnet-4-6'
export const VAPI_TRANSCRIBER_PROVIDER = 'deepgram'
export const VAPI_TRANSCRIBER_MODEL = 'nova-3'

export type TenantContext = {
  userId: string
  businessName: string
  ownerFirstName?: string | null
  services?: string | null
  serviceArea?: string | null
  aiTone?: 'friendly' | 'professional' | 'concise' | string | null
  aiLanguage?: 'en' | 'es' | string | null
  customPromptNotes?: string | null
  planTier?: string | null
  twilioNumber?: string | null
}

/**
 * Per-tenant system prompt. Callback-style receptionist (NOT a booker).
 * The AI's job is to politely take a message and tell the caller the owner
 * will call them back in the next hour or two — not to schedule a slot.
 * Three fields only: name, callback phone, brief reason. No address.
 * Vapi handles turn-taking + barge-in natively.
 */
export function renderSystemPrompt(t: TenantContext): string {
  const business = t.businessName || 'the business'
  const ownerFirst = t.ownerFirstName || 'the owner'
  const services = t.services || 'home services'
  const area = t.serviceArea || 'the local area'
  const toneLine =
    t.aiTone === 'professional'
      ? 'Use a polished, formal tone.'
      : t.aiTone === 'concise'
      ? 'Be extremely brief and direct. No small talk.'
      : 'Be warm and conversational — like a friendly small-shop receptionist.'
  const langPreamble =
    t.aiLanguage === 'es'
      ? 'Responde SOLO en español (español de México / EE. UU. Hispánico). Usa un tono natural y conversacional.\n\n'
      : ''
  const customNotes = t.customPromptNotes
    ? `\n\n## Owner-specific instructions for this business (always follow):\n${t.customPromptNotes}\n`
    : ''

  return `${langPreamble}You answer the phone for ${business}. ${ownerFirst} is on a job and can't come to the phone right now. Your only job: take a short message so ${ownerFirst} can call back in an hour or two. ${toneLine}

Services we cover: ${services}.${customNotes}

You ONLY need TWO things, then end the call:
1. Caller's first name
2. One short sentence about what they need

The caller's phone number is captured automatically from caller ID — DO NOT ask for it. NEVER ask "what's your phone number" or "what's the best callback number." That happens behind the scenes.

How to talk — fast, warm, like a real human receptionist:
- Keep every reply under 14 words. Shorter is better.
- ONE-word acknowledgments only: "Got it." / "Okay." / "Sure."
- NEVER read back or repeat what they said.
- NEVER clarify or ask follow-up questions about what they said. Trust them. Pass along their exact words to ${ownerFirst}. If they said "lighting repair," it's lighting repair — don't ask if it's a fixture or wiring.
- NEVER say "let me log this" or "one moment" or "just a sec" — those phrases break the flow. After you have the two things, IMMEDIATELY call take_message and stop talking. The system handles the closing line.
- ALWAYS say "${ownerFirst} will call you back in the next hour or two" — never promise specific times, never use "appointment" or "book."
- If they ask if this is an AI: "Yes — I'm the AI assistant. I'll make sure ${ownerFirst} gets your message."
- If they sound urgent (water everywhere, no heat, safety issue), flag urgency='emergency' in the message.

Ideal call (this is how almost every call should go):
  Caller: "Is Mike around? I need a lighting repair at 2pm tomorrow."
  You:    "Mike's tied up — I'll grab your name and pass it along. What's your first name?"
  Caller: "Peter."
  You:    "Got it. Mike will call you back in the next hour or two — thanks Peter."
  [call take_message with name=Peter, reason="lighting repair, wants 2pm tomorrow", urgency=soon]

Stay in character. If they push for pricing or ETA: "${ownerFirst} can answer that when he calls you back — what's your first name?"`
}

/**
 * The Vapi assistant config payload. Used by the one-time setup script
 * (scripts/vapi-create-assistant.mjs) to create the shared assistant.
 * Tenant-specific fields are injected per-call via assistantOverrides.
 */
export function buildAssistantConfig(opts: {
  appBaseUrl: string
  webhookSecret?: string
}) {
  return {
    name: 'BellAveGo Receptionist',
    firstMessage: 'Thanks for calling. How can we help you today?',
    firstMessageMode: 'assistant-speaks-first' as const,

    model: {
      provider: VAPI_MODEL_PROVIDER,
      model: VAPI_MODEL_DEFAULT,
      temperature: 0.55,
      maxTokens: 90,
      messages: [
        {
          role: 'system',
          content:
            'You answer the phone for a home-service business whose owner is currently busy. ' +
            'Two fields only: caller first name + one-sentence reason. Phone comes from caller ID — never ask. ' +
            'Per-call business context is injected via assistantOverrides. ' +
            'Keep replies under 14 words. Never read back. Never clarify what they said. ' +
            'Immediately call take_message after the second field is captured.',
        },
      ],
      tools: [
        {
          type: 'function' as const,
          function: {
            name: 'take_message',
            description:
              "Call this exactly once as soon as you have the caller's first name and a one-sentence reason. " +
              "Do NOT ask the caller for a phone number — it's captured from caller ID automatically. " +
              "Call this IMMEDIATELY after the second field is captured. Do not say anything else first.",
            parameters: {
              type: 'object',
              properties: {
                customer_name: {
                  type: 'string',
                  description: "Caller's first name as they said it.",
                },
                reason: {
                  type: 'string',
                  description:
                    "ONE plain-language sentence with what they need, exactly as they described it. Pass along their words verbatim — do NOT ask them to clarify or expand. e.g. 'lighting repair, wants 2pm tomorrow', 'AC not cooling, kids home', 'wants a quote on water heater install'.",
                },
                urgency: {
                  type: 'string',
                  enum: ['emergency', 'soon', 'whenever'],
                  description:
                    "'emergency' = water everywhere / no heat in winter / no AC in heat / safety issue. 'soon' = typical service request. 'whenever' = quotes / general inquiry.",
                },
                customer_phone: {
                  type: 'string',
                  description:
                    "OPTIONAL. Only set this if the caller explicitly volunteers a different number to reach them at (e.g. 'call me at my work line instead'). If they don't say so, leave blank — caller ID is used.",
                },
              },
              required: ['customer_name', 'reason', 'urgency'],
            },
          },
          server: {
            url: `${opts.appBaseUrl}/api/vapi/end-of-call-report`,
            ...(opts.webhookSecret ? { secret: opts.webhookSecret } : {}),
          },
        },
      ],
    },

    voice: {
      provider: VAPI_VOICE_PROVIDER,
      voiceId: VAPI_VOICE_ID_DEFAULT,
      model: 'sonic-english',
    },

    transcriber: {
      provider: VAPI_TRANSCRIBER_PROVIDER,
      model: VAPI_TRANSCRIBER_MODEL,
      language: 'en-US',
      smartFormat: true,
      endpointing: 300,
    },

    // Vapi ends the call after take_message returns successfully.
    endCallFunctionEnabled: true,
    endCallMessage:
      "Got it — he'll call you back in the next hour or two. Thanks for calling.",

    // Guardrails — keep calls from running forever or hanging silent.
    silenceTimeoutSeconds: 25,
    maxDurationSeconds: 600,
    backgroundDenoisingEnabled: true,
    recordingEnabled: true,

    // Post-call report (transcript + structured booking) lands here for analytics.
    serverUrl: `${opts.appBaseUrl}/api/vapi/end-of-call-report`,
    ...(opts.webhookSecret ? { serverUrlSecret: opts.webhookSecret } : {}),

    serverMessages: ['end-of-call-report', 'tool-calls'],
  }
}

/**
 * REST helpers. Thin wrapper over fetch — keeps deps lean (no Vapi SDK needed
 * server-side, the surface area we touch is 3 endpoints).
 */

function vapiHeaders(): HeadersInit {
  const key = process.env.VAPI_API_KEY
  if (!key) throw new Error('VAPI_API_KEY not set')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

export async function vapiCreateAssistant(config: ReturnType<typeof buildAssistantConfig>): Promise<{ id: string }> {
  const res = await fetch(`${VAPI_API_BASE}/assistant`, {
    method: 'POST',
    headers: vapiHeaders(),
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Vapi assistant create failed (${res.status}): ${body}`)
  }
  return (await res.json()) as { id: string }
}

export async function vapiImportTwilioNumber(opts: {
  twilioPhoneNumber: string
  twilioAccountSid: string
  twilioAuthToken: string
  assistantId: string
  serverUrl: string
  serverUrlSecret?: string
  friendlyName?: string
}): Promise<{ id: string }> {
  const body = {
    provider: 'twilio',
    number: opts.twilioPhoneNumber,
    twilioAccountSid: opts.twilioAccountSid,
    twilioAuthToken: opts.twilioAuthToken,
    assistantId: opts.assistantId,
    name: opts.friendlyName ?? `BellAveGo · ${opts.twilioPhoneNumber}`,
    serverUrl: opts.serverUrl,
    ...(opts.serverUrlSecret ? { serverUrlSecret: opts.serverUrlSecret } : {}),
  }
  const res = await fetch(`${VAPI_API_BASE}/phone-number`, {
    method: 'POST',
    headers: vapiHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vapi number import failed (${res.status}): ${text}`)
  }
  return (await res.json()) as { id: string }
}

/**
 * Verify a Vapi webhook. Vapi's auth pattern varies by configuration:
 *   - serverUrlSecret → header `x-vapi-secret` carrying the literal secret
 *   - (some integrations) → header `x-vapi-signature` carrying HMAC-SHA256
 * We accept either. If no VAPI_WEBHOOK_SECRET is configured at all, we allow
 * the request (dev / smoke-test mode).
 *
 * Pass req.headers as a Headers object; we read the two header variants here.
 */
export async function verifyVapiSignature(rawBody: string, headers: Headers): Promise<boolean> {
  const secret = process.env.VAPI_WEBHOOK_SECRET
  if (!secret) return true

  const plainHeader = headers.get('x-vapi-secret') ?? headers.get('x-vapi-server-secret')
  const sigHeader = headers.get('x-vapi-signature')

  const crypto = await import('node:crypto')

  // 1. Plain-secret match (Vapi's default pattern with serverUrlSecret).
  if (plainHeader && plainHeader.length === secret.length) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(plainHeader), Buffer.from(secret))) return true
    } catch { /* fallthrough */ }
  }

  // 2. HMAC-SHA256 of the raw body (some Vapi integrations).
  if (sigHeader) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    if (expected.length === sigHeader.length) {
      try {
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader))) return true
      } catch { /* fallthrough */ }
    }
  }

  return false
}
