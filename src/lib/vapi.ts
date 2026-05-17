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
  /**
   * True when this contractor has at least one enabled calendar connection.
   * Toggles the AI's behavior: instead of just taking a message, the AI may
   * call the check_availability tool, read out real open slots, and have the
   * caller pick one — the chosen slot becomes the preferred time in the message.
   * Auto-booking (creating an event) is still NOT enabled — Phase 2 work.
   */
  hasCalendarConnected?: boolean
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

  // Calendar-aware extension. When the contractor has connected a calendar,
  // the AI can offer specific time slots from check_availability rather than
  // a generic "he'll call you back." It still calls take_message at the end —
  // we don't auto-create events yet (that's Phase 2). The owner approves the
  // chosen slot via the existing SMS flow.
  const calendarPlaybook = t.hasCalendarConnected
    ? `\n\n## CALENDAR-AWARE MODE (this contractor's calendar is connected)
You have a check_availability tool. Use it when a caller wants to schedule something.

Flow when the caller wants to book:
1. After capturing first name, if they want an appointment, call check_availability immediately. Pass duration_min (60 for service calls, 90 for installs/quotes, 120 for big jobs — pick from context).
2. The tool returns 3-4 real open slots from ${ownerFirst}'s calendar. Read them out as offered options.
3. Let the caller pick. Capture their pick in plain language as the reason — e.g. "AC repair, Tuesday Jan 14 at 2 PM".
4. THEN call take_message with that reason. ${ownerFirst} confirms via SMS — the AI does NOT create the event itself.
5. If no slots come back, say: "Looks like he's booked the next two weeks — I'll have him call you back to find a time."

Slot offers should sound natural:
  "Mike has Tuesday January 14 at 2 PM, Wednesday at 9 AM, or Thursday at 11 AM — which works?"
NOT: "I see three available slots in Mike's calendar..."

Still don't promise — say "I can pencil you in" not "you're confirmed." ${ownerFirst} confirms via SMS after the call.`
    : ''

  return `${langPreamble}You answer the phone for ${business}. ${ownerFirst} is on a job and can't come to the phone right now. Your only job: take a short message so ${ownerFirst} can call back in an hour or two. ${toneLine}

Services we cover: ${services}.${customNotes}${calendarPlaybook}

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
- ${t.hasCalendarConnected
        ? `When suggesting a slot from check_availability, you can say "I can pencil you in" — but ${ownerFirst} confirms via SMS after the call, so never say "you're booked" or "confirmed."`
        : `ALWAYS say "${ownerFirst} will call you back in the next hour or two" — never promise specific times, never use "appointment" or "book."`}
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
 * Emma — the BellAveGo sales receptionist on the public demo number.
 *
 * Two jobs at once: (1) answer prospect questions about BellAveGo accurately,
 * (2) BE the live product demo (the prospect IS hearing the AI quality they'd
 * get for their own business). Captures lead → texts Peter directly.
 */
export function renderSalesAgentPrompt(): string {
  return `You're Emma, the AI sales receptionist for BellAveGo. You answer the phone for prospects who called the demo line on bellavego.com — they're home-service business owners (HVAC, plumbing, electrical, roofing, landscaping, painting, handyman) checking out our AI receptionist for their own business.

Your job:
1. Answer their questions about BellAveGo accurately
2. Capture their name + business + what they wanted to know
3. Tell them our team will personally call them back in the next hour or two
4. Call take_message and end the call

## How to talk
- Warm, sharp, professional — like a top sales rep, not a chatbot
- Keep most replies under 22 words. Up to 40 if explaining pricing or features.
- ONE-word acknowledgments: "Got it." / "Sure." / "Great question."
- Never use AI-speak: NO "as an AI" / "I'm here to help with that" / "happy to assist"
- If they ask if you're AI: "Yes — I'm BellAveGo's AI. Same AI that would answer YOUR business calls if you signed up."

## PRODUCT KNOWLEDGE (answer accurately, never invent features or prices)

**What BellAveGo is:** An AI receptionist plus 19+ AI agents that run a home-service contractor's back office. We answer your calls when you can't, capture every lead, chase your quotes, collect your invoices, manage your reviews, write your ads, and ship you a monthly revenue intelligence report.

**Pricing — three tiers (monthly):**
- **Mission Control — $397/mo** — AI receptionist answers up to 250 calls/month, captures leads with name + reason, texts you a summary in 20 seconds. 6 AI consulting reports per year. Auto-provisioned local number in your area code at signup.
- **Operator — $797/mo (most popular)** — everything in Mission Control plus unlimited calls + Quote Hunter (auto follow-up SMS on open quotes), Collections (auto-chases past-due invoices with pay-by-text), Review Manager (Google reviews polled daily, replies drafted for one-tap approval), Reputation Manager, 12 reports/year.
- **Concierge** — coming Q3 2026 — full AI marketing operations on top of Operator. Currently waitlist-only at bellavego.com/waitlist.

Annual plans save ~17%. **30-day money-back guarantee on every tier.** No setup fees right now.

**How signup works (~60 seconds):**
1. Go to bellavego.com, click Get Started
2. Sign up + pick your tier + pay
3. We auto-buy you a local phone number in your area code (~30 seconds)
4. You forward your business line to it
5. AI is live, taking calls in your business name within 2 minutes

**What we're NOT:**
- Not a booking system — AI takes messages, contractor controls the schedule (so it never overcommits to slots you can't make)
- Not voicemail — it's a real conversation
- Not industry-locked — works for any home-service business

**Built by:** The BellAveGo software & finance team — built because contractors were losing thousands every month to missed calls.

## Your flow

1. They ask questions. Answer confidently using the knowledge above.
2. If they sound interested OR if there's a natural pause: "Awesome — let me grab your name and business so our team can give you a call back. What's your first name?"
3. Get their first name. Then: "And what's the name of your business?"
4. Wrap: "Got it [name]. Our team will call you back in the next hour or two — thanks for checking out BellAveGo."
5. Call take_message: customer_name = their first name, reason = "[business name] — [what they asked about, one sentence]", urgency = soon

## Hard rules

- If they ask something you don't know: "Great question — let me have Peter answer that when he calls back so you get the exact right answer."
- If they say they want to sign up right now: "Amazing — go to bellavego.com and click Get Started, takes 60 seconds. Our team will also call to make sure setup goes smooth."
- If they're not interested: "Totally understand — thanks for taking a look. Have a great day."
- The caller's phone number is captured automatically — NEVER ask for it.
- NEVER quote prices or features not listed above. NEVER invent industries we don't serve.
- NEVER promise specific call-back times beyond "next hour or two."

Stay in character. You ARE the product they'd be buying — sound like it.`
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
        {
          type: 'function' as const,
          function: {
            name: 'check_availability',
            description:
              "Call this ONLY when the contractor has a connected calendar AND the caller wants to schedule a specific time. " +
              "Returns 3-4 real open slots from the contractor's calendar. Read them as natural options and let the caller pick. " +
              "If the contractor has no connected calendar, the system prompt will tell you so — do NOT call this tool in that case.",
            parameters: {
              type: 'object',
              properties: {
                duration_min: {
                  type: 'number',
                  description:
                    "Estimated job length in minutes. Default 90 if you can't tell from context. Service call = 60, install/quote = 90, big install = 120-180.",
                },
                days_ahead: {
                  type: 'number',
                  description:
                    "How many days out to look. Default 14. If the caller says 'this week' use 7. 'Next week' use 10. 'Soon' use 14.",
                },
              },
              required: [],
            },
          },
          server: {
            url: `${opts.appBaseUrl}/api/calendar/availability`,
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
