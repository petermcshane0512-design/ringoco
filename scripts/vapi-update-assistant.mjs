#!/usr/bin/env node
/**
 * PATCH the existing BellAveGo Receptionist assistant in Vapi with the latest
 * config from src/lib/vapi.ts (system prompt, tools, voice, transcriber).
 *
 * Run this any time we tweak the prompt or change tools. Vapi assignments are
 * PATCHable — no need to re-import phone numbers.
 *
 * Prereqs in .env.local (or shell env):
 *   VAPI_API_KEY
 *   VAPI_ASSISTANT_ID
 *   VAPI_WEBHOOK_SECRET (optional)
 *   NEXT_PUBLIC_APP_URL  (or pass --base-url)
 *
 * Usage:
 *   node scripts/vapi-update-assistant.mjs
 *   node scripts/vapi-update-assistant.mjs --base-url https://www.bellavego.com
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

function loadEnvLocal() {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const envPath = resolve(here, '..', '.env.local')
    let text = readFileSync(envPath, 'utf8')
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq < 1) continue
      const k = line.slice(0, eq).trim()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue
      let v = line.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnvLocal()

const argv = process.argv.slice(2)
const argBaseUrl = (() => {
  const i = argv.indexOf('--base-url')
  return i >= 0 ? argv[i + 1] : undefined
})()

const VAPI_API_KEY = process.env.VAPI_API_KEY
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || ''
const BASE_URL =
  argBaseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://www.bellavego.com'
const VAPI_VOICE_ID = process.env.VAPI_VOICE_ID || '156fb8d2-335b-4950-9cb3-a2d33befec77'

if (!VAPI_API_KEY) {
  console.error('❌ VAPI_API_KEY missing.'); process.exit(1)
}
if (!VAPI_ASSISTANT_ID) {
  console.error('❌ VAPI_ASSISTANT_ID missing.'); process.exit(1)
}
if (BASE_URL.includes('localhost')) {
  console.error('❌ NEXT_PUBLIC_APP_URL is localhost — pass --base-url https://www.bellavego.com'); process.exit(1)
}

// Mirror src/lib/vapi.ts buildAssistantConfig — kept inline so this script
// has no TypeScript / build dependency. If you change the canonical version,
// update both. (One day we'll dedupe via a shared .mjs file.)
//
// IMPORTANT — design note (May 2026 rewrite):
// The base assistant is INTENTIONALLY minimal now. Personality + rules +
// example dialogues all come via assistantOverrides per-call. Previously
// the base had restrictive rules ("keep replies under 14 words / never
// clarify / immediately call take_message after 2 fields") that fought
// against the per-call override prompts, producing robotic Emma behavior.
// Now: base = minimal stub, override = the whole show. Run this script
// after any change to buildAssistantConfig() in src/lib/vapi.ts.
const patch = {
  name: 'BellAveGo Emma',
  firstMessage: 'Hi, this is Emma. How can I help?',
  firstMessageMode: 'assistant-speaks-first',

  model: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    temperature: 0.6,
    maxTokens: 220, // was 90 — too tight, forced robotic replies. Override may bump higher.
    messages: [
      {
        role: 'system',
        content:
          'You are Emma, the AI receptionist for a home-service business. ' +
          'CRITICAL: your complete personality, hard rules, product knowledge (sales mode), ' +
          'business context (receptionist mode), and example dialogues are injected via ' +
          'assistantOverrides on every call. Follow the override system message EXACTLY ' +
          'and IGNORE this fallback message if an override is provided. ' +
          'Default tools: take_message (always), check_availability (only when override prompt confirms calendar is connected).',
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'take_message',
          description:
            "Call this after you've captured the caller's first name AND understood what they need (one sentence). " +
            "Do NOT ask the caller for their phone number — it's captured from caller ID automatically. " +
            "SALES MODE (Emma representing BellAveGo on the demo line): only call this AFTER you've answered their questions AND captured their first name + business name. " +
            "RECEPTIONIST MODE (Emma representing a contractor): call this AFTER you've captured the caller's first name + a one-sentence reason for the call.",
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string', description: "Caller's first name as they said it." },
              reason: {
                type: 'string',
                description:
                  "ONE plain-language sentence with what they need, in their own words. Include preferred time if mentioned. " +
                  "Receptionist mode examples: 'AC not cooling, kids home', 'leaky kitchen faucet, wants Tuesday', 'quote on water heater install'. " +
                  "Sales mode examples: \"Mike's Plumbing — ready to sign up for Operator $797\", \"Tom's HVAC — asked about pricing, leaning Mission Control $397\".",
              },
              urgency: {
                type: 'string',
                enum: ['emergency', 'soon', 'whenever'],
                description:
                  "'emergency' = water everywhere / no heat in winter / no AC in heat / electrical / safety. " +
                  "'soon' = typical service request, interested prospect. " +
                  "'whenever' = quotes / general inquiry / not ready to decide.",
              },
              customer_phone: {
                type: 'string',
                description:
                  "OPTIONAL. Only set this if the caller explicitly volunteers a different number (e.g. 'call me at my work line instead'). If they don't say so, leave blank — caller ID is used.",
              },
            },
            required: ['customer_name', 'reason', 'urgency'],
          },
        },
        server: {
          url: `${BASE_URL}/api/vapi/end-of-call-report`,
          ...(VAPI_WEBHOOK_SECRET ? { secret: VAPI_WEBHOOK_SECRET } : {}),
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_availability',
          description:
            "Call this ONLY when the override system prompt says the contractor has a connected calendar AND the caller wants a specific time. " +
            "Returns 3-4 real open slots from the contractor's calendar. Read them as natural options and let the caller pick. " +
            "If the override prompt says no calendar is connected, do NOT call this tool — just take the message.",
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
          url: `${BASE_URL}/api/calendar/availability`,
          ...(VAPI_WEBHOOK_SECRET ? { secret: VAPI_WEBHOOK_SECRET } : {}),
        },
      },
    ],
  },

  voice: { provider: 'cartesia', voiceId: VAPI_VOICE_ID, model: 'sonic-english' },
  transcriber: { provider: 'deepgram', model: 'nova-3', language: 'en-US', smartFormat: true, endpointing: 300 },

  endCallFunctionEnabled: true,
  endCallMessage: "Got it — talk soon. Thanks for calling.",

  silenceTimeoutSeconds: 25,
  maxDurationSeconds: 600,
  backgroundDenoisingEnabled: true,
  recordingEnabled: true,

  serverUrl: `${BASE_URL}/api/vapi/end-of-call-report`,
  ...(VAPI_WEBHOOK_SECRET ? { serverUrlSecret: VAPI_WEBHOOK_SECRET } : {}),
  serverMessages: ['end-of-call-report', 'tool-calls'],
}

const res = await fetch(`https://api.vapi.ai/assistant/${VAPI_ASSISTANT_ID}`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(patch),
})

if (!res.ok) {
  const t = await res.text()
  console.error(`❌ Vapi assistant PATCH failed (${res.status}):`)
  console.error(t)
  process.exit(1)
}

const j = await res.json()
console.log('')
console.log('✅ Assistant updated.')
console.log(`   ID:        ${j.id ?? VAPI_ASSISTANT_ID}`)
console.log(`   Name:      ${j.name ?? patch.name}`)
console.log(`   Voice:     Cartesia · ${VAPI_VOICE_ID}`)
console.log(`   Tools:     take_message + check_availability`)
console.log(`   maxTokens: 220 (was 90 — Emma can finally breathe)`)
console.log(`   System:    minimal stub — full personality via per-call overrides`)
console.log(`   First msg: "${patch.firstMessage}"`)
console.log(`   End msg:   "${patch.endCallMessage}"`)
console.log('')
console.log('📞 Call the demo number — Emma should now:')
console.log('   - Acknowledge what you said (no more "what do you need" after "I want to sign up")')
console.log('   - Sound conversational (no more 14-word cap, no filler phrases)')
console.log('   - Answer pricing/feature questions accurately')
console.log('   - Capture name + business before closing')
console.log('')
