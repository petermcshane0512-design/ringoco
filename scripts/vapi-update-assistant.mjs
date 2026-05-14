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
const patch = {
  name: 'BellAveGo Receptionist',
  firstMessage: 'Thanks for calling. How can we help you today?',
  firstMessageMode: 'assistant-speaks-first',

  model: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
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
        type: 'function',
        function: {
          name: 'take_message',
          description:
            "Call this exactly once as soon as you have the caller's first name and a one-sentence reason. Do NOT ask the caller for a phone number — it's captured from caller ID automatically. Call this IMMEDIATELY after the second field is captured. Do not say anything else first.",
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string', description: "Caller's first name as they said it." },
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
          url: `${BASE_URL}/api/vapi/end-of-call-report`,
          ...(VAPI_WEBHOOK_SECRET ? { secret: VAPI_WEBHOOK_SECRET } : {}),
        },
      },
    ],
  },

  voice: { provider: 'cartesia', voiceId: VAPI_VOICE_ID, model: 'sonic-english' },
  transcriber: { provider: 'deepgram', model: 'nova-3', language: 'en-US', smartFormat: true, endpointing: 300 },

  endCallFunctionEnabled: true,
  endCallMessage: "Got it — he'll call you back in the next hour or two. Thanks for calling.",

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
console.log(`   Tool:      take_message (name, phone, reason, urgency)`)
console.log(`   First msg: "${patch.firstMessage}"`)
console.log(`   End msg:   "${patch.endCallMessage}"`)
console.log('')
console.log('📞 Call your test number to hear the new callback flow.')
console.log('')
