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
 * Per-tenant system prompt. Identical conversation contract to the legacy
 * Polly/Haiku route — same 5 fields, ≤22 words/turn, acknowledge then ask.
 * Vapi handles turn-taking + barge-in natively, so we don't need the cadence
 * tricks the old prompt used.
 */
export function renderSystemPrompt(t: TenantContext): string {
  const business = t.businessName || 'the business'
  const services = t.services || 'home services'
  const area = t.serviceArea || 'the local area'
  const toneLine =
    t.aiTone === 'professional'
      ? 'Use a polished, formal tone.'
      : t.aiTone === 'concise'
      ? 'Be extremely brief and direct. No small talk.'
      : 'Be warm and conversational.'
  const langPreamble =
    t.aiLanguage === 'es'
      ? 'Responde SOLO en español (español de México / EE. UU. Hispánico). Usa un tono natural y conversacional.\n\n'
      : ''
  const customNotes = t.customPromptNotes
    ? `\n\n## Owner-specific instructions for this business (always follow):\n${t.customPromptNotes}\n`
    : ''

  return `${langPreamble}You are the AI phone receptionist for ${business} — a real home-service business serving ${area}. ${toneLine}

Services we offer: ${services}.${customNotes}

Your job: collect 5 fields in this order so the owner can confirm the appointment.
1. Caller's first name
2. Best callback number
3. Which service they need — match it to one of our services above ("Sounds like an HVAC issue" / "That's a plumbing call")
4. Their address (street + city)
5. Preferred day and time window

How to talk:
- Speak like a real receptionist. Conversational, confident, warm — not robotic.
- Stay under 22 words per turn. Acknowledge what they said before asking the next question.
- Never say "confirmed" — say "the owner will text you shortly to confirm."
- If they ask anything off-topic (pricing estimates, technical questions), say "the owner can answer that when he calls back — let me grab your details first."

When you have all 5 fields, call the book_appointment function with them.
Never invent values. If a field is unclear, ask again briefly.

Only role: book a service call. Politely decline anything else: "I can only help schedule a service call — what's your name?"`
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
      maxTokens: 180,
      messages: [
        {
          role: 'system',
          content:
            'You are a polished AI receptionist for a home-service business. ' +
            'Per-call business context is provided via assistantOverrides. ' +
            'Collect 5 fields then call book_appointment.',
        },
      ],
      tools: [
        {
          type: 'function' as const,
          function: {
            name: 'book_appointment',
            description:
              "Call this exactly once when you've collected all 5 fields from the caller. " +
              "Don't call it earlier — the owner can't confirm a partial booking.",
            parameters: {
              type: 'object',
              properties: {
                customer_name: {
                  type: 'string',
                  description: "Caller's full name as they said it.",
                },
                customer_phone: {
                  type: 'string',
                  description:
                    "Best callback number. Use the number they explicitly gave, not the caller ID.",
                },
                service_needed: {
                  type: 'string',
                  description:
                    "Brief service description matched to one of the business's offered services (e.g. 'AC repair', 'water heater install').",
                },
                address: {
                  type: 'string',
                  description: 'Street address + city.',
                },
                preferred_time: {
                  type: 'string',
                  description:
                    "Preferred day and time window, in the caller's own words (e.g. 'Wednesday afternoon').",
                },
              },
              required: [
                'customer_name',
                'customer_phone',
                'service_needed',
                'address',
                'preferred_time',
              ],
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

    // Vapi will end the call after book_appointment tool returns successfully.
    endCallFunctionEnabled: true,
    endCallMessage:
      "Got it. The owner will text you shortly to confirm. Thanks for calling — have a great day.",

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
