/**
 * Pushes the current buildAssistantConfig() output to the live Vapi
 * assistant via PATCH /assistant/{id}. Run this any time you edit the
 * Vapi tools, system prompt, or transcriber settings in src/lib/vapi.ts.
 *
 * Usage:
 *   node scripts/sync-vapi-assistant.mjs
 *
 * Reads from .env.local:
 *   VAPI_API_KEY          (required)
 *   VAPI_ASSISTANT_ID     (required — the existing assistant we patch)
 *   VAPI_WEBHOOK_SECRET   (optional — included in serverUrlSecret if set)
 *   NEXT_PUBLIC_APP_URL   (optional — defaults to https://www.bellavego.com)
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Load .env.local manually (no extra deps)
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, raw] = m
    if (process.env[key]) continue
    let val = raw.trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

const VAPI_API_KEY = process.env.VAPI_API_KEY
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET
const APP_URL = process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
  ? process.env.NEXT_PUBLIC_APP_URL
  : 'https://www.bellavego.com'

if (!VAPI_API_KEY) {
  console.error('❌ VAPI_API_KEY missing in .env.local')
  process.exit(1)
}
if (!VAPI_ASSISTANT_ID) {
  console.error('❌ VAPI_ASSISTANT_ID missing in .env.local')
  process.exit(1)
}

console.log(`→ Patching Vapi assistant ${VAPI_ASSISTANT_ID}`)
console.log(`→ Server URLs will point to ${APP_URL}`)

// We can't import the TypeScript file directly from .mjs without a compiler,
// so we inline the assistant config here. Keep this in sync with
// buildAssistantConfig() in src/lib/vapi.ts. The script is small enough that
// duplication is fine; the alternative is running a TS compiler step.
const config = {
  name: 'BellAveGo Receptionist',
  // Branded fallback. Should normally be overridden by assistantOverrides
  // from /api/vapi/assistant-request. Setting it explicitly so that if
  // the override path ever fails again (e.g. phone-number serverUrl
  // pointing at localhost — actually happened May 2026), Emma still
  // identifies as BellAveGo on the demo line.
  firstMessage: 'Hi, this is Emma with BellAveGo. How can I help?',
  firstMessageMode: 'assistant-speaks-first',
  model: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    temperature: 0.6,
    maxTokens: 220,
    messages: [
      {
        // Branded fallback system prompt. Per-call override replaces
        // this with renderSalesAgentPrompt() (demo) or renderSystemPrompt(t)
        // (tenant) — see src/lib/vapi.ts. If the override fails, this
        // produces a short, BellAveGo-branded message-take rather than
        // impersonating a generic "home-service business".
        role: 'system',
        content:
          'You are Emma, the AI receptionist for BellAveGo, an AI platform for home-service contractors. ' +
          'Per-call business context is normally injected via assistantOverrides. If you are reading this default prompt, ' +
          'the override path may have failed — keep it short and BellAveGo-branded. ' +
          'Open with "Hi, this is Emma with BellAveGo — how can I help?". Listen, take the caller\'s first name + a one-sentence reason for calling, ' +
          'then call take_message with name + reason + urgency (emergency / soon / whenever). ' +
          'Do not invent business names. Do not promise specific appointment times. Do not say "home-service business" as a stand-in for a real name. ' +
          'Tools available: take_message (always), check_availability + book_appointment (only when an overriding system prompt says a calendar is connected).',
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'take_message',
          description:
            "Call this once you have the caller's first name and a one-sentence reason for the call. " +
            "Use when the caller does NOT want a specific appointment time, OR when no calendar is connected. " +
            "Phone is captured from caller ID — do NOT ask.",
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string', description: "Caller's first name." },
              reason: { type: 'string', description: 'ONE sentence in their own words, including any time they mentioned.' },
              urgency: { type: 'string', enum: ['emergency', 'soon', 'whenever'] },
              customer_phone: { type: 'string', description: 'OPTIONAL — only if caller volunteers a different callback number.' },
            },
            required: ['customer_name', 'reason', 'urgency'],
          },
        },
        server: {
          url: `${APP_URL}/api/vapi/end-of-call-report`,
          ...(VAPI_WEBHOOK_SECRET ? { secret: VAPI_WEBHOOK_SECRET } : {}),
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_availability',
          description:
            "Call this ONLY when the per-call system prompt says the contractor has a connected calendar AND the caller wants to schedule a specific time. " +
            "Returns 3-4 real open slots with ISO timestamps. Read the human-readable labels (NOT the iso=) to the caller and let them pick one. " +
            "If the prompt says no calendar is connected, do NOT call this — just take a message.",
          parameters: {
            type: 'object',
            properties: {
              duration_min: { type: 'number', description: 'Estimated job length in minutes. Service call = 60, install/quote = 90, big install = 120-180. Default 90.' },
              days_ahead: { type: 'number', description: "How many days out to look. Default 14. 'This week' = 7, 'next week' = 10." },
            },
            required: [],
          },
        },
        server: {
          url: `${APP_URL}/api/calendar/availability`,
          ...(VAPI_WEBHOOK_SECRET ? { secret: VAPI_WEBHOOK_SECRET } : {}),
        },
      },
      {
        type: 'function',
        function: {
          name: 'book_appointment',
          description:
            "Call this IMMEDIATELY after the caller picks one of the slots you offered from check_availability. " +
            "DO NOT call this without first calling check_availability. " +
            "DO NOT call this if no calendar is connected — use take_message instead. " +
            "On success: event is created in the contractor's calendar (Google/Outlook/Apple via Cronofy), caller gets confirmation SMS, contractor gets booking-alert SMS. Read back what the tool tells you to say.",
          parameters: {
            type: 'object',
            properties: {
              start_iso: { type: 'string', description: 'EXACT ISO-8601 timestamp from the slot the caller picked. Use the iso= value verbatim — do NOT invent a time.' },
              duration_min: { type: 'number', description: 'Same duration you passed to check_availability. Default 90.' },
              customer_name: { type: 'string', description: "Caller's first name." },
              service_summary: { type: 'string', description: "ONE plain-language sentence describing the job, e.g. 'AC tune-up', 'leaky kitchen faucet'." },
            },
            required: ['start_iso', 'customer_name', 'service_summary'],
          },
        },
        server: {
          url: `${APP_URL}/api/calendar/book`,
          ...(VAPI_WEBHOOK_SECRET ? { secret: VAPI_WEBHOOK_SECRET } : {}),
        },
      },
    ],
  },
  voice: {
    provider: 'cartesia',
    voiceId: '156fb8d2-335b-4950-9cb3-a2d33befec77',
    model: 'sonic-english',
  },
  transcriber: {
    provider: 'deepgram',
    model: 'nova-3',
    language: 'en-US',
    smartFormat: true,
    endpointing: 300,
  },
  endCallFunctionEnabled: true,
  endCallMessage: "Got it — he'll call you back in the next hour or two. Thanks for calling.",
  silenceTimeoutSeconds: 25,
  maxDurationSeconds: 600,
  backgroundDenoisingEnabled: true,
  recordingEnabled: true,
  serverUrl: `${APP_URL}/api/vapi/end-of-call-report`,
  ...(VAPI_WEBHOOK_SECRET ? { serverUrlSecret: VAPI_WEBHOOK_SECRET } : {}),
  serverMessages: ['end-of-call-report', 'tool-calls'],
}

const res = await fetch(`https://api.vapi.ai/assistant/${VAPI_ASSISTANT_ID}`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(config),
})

const body = await res.text()
if (!res.ok) {
  console.error(`❌ Vapi update failed (HTTP ${res.status})`)
  console.error(body)
  process.exit(1)
}

let parsed
try { parsed = JSON.parse(body) } catch { parsed = body }
console.log(`✅ Vapi assistant updated`)
console.log(`Tools now registered: take_message, check_availability, book_appointment`)
console.log(`Test by calling your BellAveGo number and saying "I'd like to schedule an appointment Tuesday"`)
