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

  return `${langPreamble}You answer the phone for ${business} — a real home-service business serving ${area}. ${ownerFirst} is busy on a job right now, and your only job is to take a short message so ${ownerFirst} can call them back. ${toneLine}

Services we cover: ${services}.${customNotes}

Your goal: collect THREE things, fast and friendly, then end the call.
1. Caller's first name
2. Best callback number
3. One-sentence reason for the call (what service they need, what's going on)

How to talk:
- Speak like a real human receptionist. Brief, warm, natural. No robot phrases.
- Stay under 18 words per turn.
- DO NOT read back or confirm what they said. One quick acknowledgment ("Got it." / "Okay." / "Sure.") and move to the next question.
- DO NOT promise specific times. ALWAYS say "${ownerFirst} will call you back in the next hour or two."
- NEVER use the word "appointment" or "book" — you're taking a message, not scheduling.
- If they push for pricing, ETA, or technical answers, redirect: "${ownerFirst} can answer that when he calls you back — let me just grab your details."
- If they ask if this is an AI, be honest and brief: "Yes, I'm the AI assistant. I'll make sure ${ownerFirst} gets your message right away."
- If they sound urgent ("water everywhere", "no heat", "emergency"), note it in the reason and tell them you'll flag it as urgent.

When you have all three things, call the take_message function ONCE with them. Then say one short closing line like "Got it — ${ownerFirst} will call you back in the next hour or two. Thanks for calling." and end the call.

Never invent values. If something's unclear, ask once briefly — don't grill them.

Stay in character. Politely decline anything off-topic: "I'm just taking messages right now — what's the best number for ${ownerFirst} to call you back on?"`
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
      temperature: 0.6,
      maxTokens: 140,
      messages: [
        {
          role: 'system',
          content:
            'You answer the phone for a home-service business whose owner is currently busy. ' +
            'Take a short message (name, callback phone, reason) so the owner can call back. ' +
            'Per-call business context is injected via assistantOverrides. ' +
            'Never read back what the caller said. Never schedule a time. ' +
            'After collecting the three fields, call take_message and end the call.',
        },
      ],
      tools: [
        {
          type: 'function' as const,
          function: {
            name: 'take_message',
            description:
              "Call this exactly once when you've collected the caller's name, callback phone, and a one-sentence reason. " +
              "Do NOT call it before all three are captured. Do NOT call it more than once per call.",
            parameters: {
              type: 'object',
              properties: {
                customer_name: {
                  type: 'string',
                  description: "Caller's first name (last name optional) as they said it.",
                },
                customer_phone: {
                  type: 'string',
                  description:
                    "Best callback number the caller gave. Use the number they explicitly said, not the caller ID.",
                },
                reason: {
                  type: 'string',
                  description:
                    "One short sentence describing what they need help with, in plain language (e.g. 'AC stopped working, no cold air', 'leak under kitchen sink', 'wants a quote for water heater install').",
                },
                urgency: {
                  type: 'string',
                  enum: ['emergency', 'soon', 'whenever'],
                  description:
                    "How urgent: 'emergency' if they said water everywhere / no heat / no AC in the heat / safety issue; 'soon' for typical issues; 'whenever' for non-urgent quotes or general questions.",
                },
              },
              required: ['customer_name', 'customer_phone', 'reason', 'urgency'],
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
 * Verify Vapi webhook signature. Vapi signs payloads with HMAC-SHA256 of the
 * raw request body using the serverUrlSecret we configured on the assistant /
 * phone number. Header: x-vapi-signature.
 */
export async function verifyVapiSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const secret = process.env.VAPI_WEBHOOK_SECRET
  if (!secret) return true // dev mode — no secret set yet; allow
  if (!signatureHeader) return false
  const crypto = await import('node:crypto')
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  // Constant-time compare
  if (expected.length !== signatureHeader.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))
}
