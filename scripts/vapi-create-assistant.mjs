#!/usr/bin/env node
/**
 * One-time setup: create the BellAveGo Receptionist assistant in Vapi.
 *
 * Prereqs:
 *   - VAPI_API_KEY in .env.local (or shell env)
 *   - NEXT_PUBLIC_APP_URL set (e.g. https://www.bellavego.com), or pass --base-url
 *   - Optional: VAPI_WEBHOOK_SECRET (recommended) for signed webhooks
 *
 * Usage:
 *   node scripts/vapi-create-assistant.mjs
 *   node scripts/vapi-create-assistant.mjs --base-url https://www.bellavego.com
 *
 * Output: prints the assistantId. Paste it into Vercel as VAPI_ASSISTANT_ID
 * (Production + Preview + Development) and redeploy.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Load .env.local if present so this works in fresh checkouts
function loadEnvLocal() {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const envPath = resolve(here, '..', '.env.local')
    const text = readFileSync(envPath, 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      const [, k, rawV] = m
      const v = rawV.replace(/^["']|["']$/g, '').trim()
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    /* no .env.local — rely on shell env */
  }
}
loadEnvLocal()

const argv = process.argv.slice(2)
const argBaseUrl = (() => {
  const i = argv.indexOf('--base-url')
  return i >= 0 ? argv[i + 1] : undefined
})()

const VAPI_API_KEY = process.env.VAPI_API_KEY
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || ''
const BASE_URL =
  argBaseUrl ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://www.bellavego.com'

if (!VAPI_API_KEY) {
  console.error('❌ VAPI_API_KEY missing. Add to .env.local or your shell env.')
  process.exit(1)
}
if (BASE_URL.includes('localhost')) {
  console.error(
    '❌ NEXT_PUBLIC_APP_URL is localhost — Vapi webhooks need a public URL. Use --base-url https://www.bellavego.com',
  )
  process.exit(1)
}

const VAPI_VOICE_ID = process.env.VAPI_VOICE_ID || '156fb8d2-335b-4950-9cb3-a2d33befec77' // Cartesia "Helpful Woman"

const config = {
  name: 'BellAveGo Receptionist',
  firstMessage: 'Thanks for calling. How can we help you today?',
  firstMessageMode: 'assistant-speaks-first',

  model: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
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
        type: 'function',
        function: {
          name: 'book_appointment',
          description:
            "Call this exactly once when you've collected all 5 fields. Don't call it earlier — the owner can't confirm a partial booking.",
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string', description: "Caller's full name as they said it." },
              customer_phone: {
                type: 'string',
                description: 'Best callback number. Use the number they explicitly gave, not the caller ID.',
              },
              service_needed: {
                type: 'string',
                description: "Brief service description matched to one of the business's offered services.",
              },
              address: { type: 'string', description: 'Street address + city.' },
              preferred_time: {
                type: 'string',
                description: "Preferred day and time window, in the caller's own words.",
              },
            },
            required: ['customer_name', 'customer_phone', 'service_needed', 'address', 'preferred_time'],
          },
        },
        server: {
          url: `${BASE_URL}/api/vapi/end-of-call-report`,
          ...(VAPI_WEBHOOK_SECRET ? { secret: VAPI_WEBHOOK_SECRET } : {}),
        },
      },
    ],
  },

  voice: {
    provider: 'cartesia',
    voiceId: VAPI_VOICE_ID,
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
  endCallMessage: "Got it. The owner will text you shortly to confirm. Thanks for calling — have a great day.",

  silenceTimeoutSeconds: 25,
  maxDurationSeconds: 600,
  backgroundDenoisingEnabled: true,
  recordingEnabled: true,

  serverUrl: `${BASE_URL}/api/vapi/end-of-call-report`,
  ...(VAPI_WEBHOOK_SECRET ? { serverUrlSecret: VAPI_WEBHOOK_SECRET } : {}),
  serverMessages: ['end-of-call-report', 'tool-calls'],
}

const res = await fetch('https://api.vapi.ai/assistant', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(config),
})

if (!res.ok) {
  const text = await res.text()
  console.error(`❌ Vapi assistant create failed (${res.status}):`)
  console.error(text)
  process.exit(1)
}

const j = await res.json()
console.log('')
console.log('✅ Assistant created.')
console.log('')
console.log(`   Assistant ID:  ${j.id}`)
console.log(`   Name:          ${j.name ?? config.name}`)
console.log(`   Voice:         Cartesia · ${VAPI_VOICE_ID}`)
console.log(`   Model:         claude-sonnet-4-6`)
console.log(`   Transcriber:   Deepgram nova-3`)
console.log(`   Webhook URL:   ${BASE_URL}/api/vapi/end-of-call-report`)
console.log(`   Request URL:   ${BASE_URL}/api/vapi/assistant-request`)
console.log('')
console.log('📋 Next steps:')
console.log('   1. Paste this into Vercel env as VAPI_ASSISTANT_ID:')
console.log(`        ${j.id}`)
console.log('   2. Run scripts/vapi-import-numbers.mjs to register your Twilio numbers.')
console.log('   3. Call your test BellAveGo number and confirm Cartesia answers.')
console.log('')
