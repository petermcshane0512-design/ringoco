#!/usr/bin/env node
/**
 * Import existing Twilio numbers from `profiles.twilio_number` into Vapi.
 *
 * Run this ONCE after creating the assistant (vapi-create-assistant.mjs).
 * Going forward, provisionNumberForUser() handles the Vapi import automatically
 * for every new customer.
 *
 * Usage:
 *   node scripts/vapi-import-numbers.mjs            # imports all profiles.twilio_number
 *   node scripts/vapi-import-numbers.mjs +1XXXXXXX  # imports a single number
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

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
  } catch { /* */ }
}
loadEnvLocal()

const {
  VAPI_API_KEY,
  VAPI_ASSISTANT_ID,
  VAPI_WEBHOOK_SECRET = '',
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL = 'https://www.bellavego.com',
} = process.env

const missing = []
if (!VAPI_API_KEY) missing.push('VAPI_API_KEY')
if (!VAPI_ASSISTANT_ID) missing.push('VAPI_ASSISTANT_ID (run vapi-create-assistant.mjs first)')
if (!TWILIO_ACCOUNT_SID) missing.push('TWILIO_ACCOUNT_SID')
if (!TWILIO_AUTH_TOKEN) missing.push('TWILIO_AUTH_TOKEN')
if (!NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (missing.length) {
  console.error('❌ Missing env vars:', missing.join(', '))
  process.exit(1)
}

const explicitNumber = process.argv[2]

async function fetchNumbers() {
  if (explicitNumber) return [{ user_id: '(manual)', twilio_number: explicitNumber, business_name: 'manual import' }]
  const res = await fetch(
    `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=user_id,business_name,twilio_number&twilio_number=not.is.null`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  )
  if (!res.ok) {
    console.error('❌ Supabase fetch failed:', res.status, await res.text())
    process.exit(1)
  }
  return res.json()
}

const numbers = await fetchNumbers()
if (!numbers.length) {
  console.log('No numbers to import.')
  process.exit(0)
}

console.log(`Importing ${numbers.length} number(s) into Vapi...`)
console.log('')

let ok = 0
let fail = 0
for (const row of numbers) {
  const body = {
    provider: 'twilio',
    number: row.twilio_number,
    twilioAccountSid: TWILIO_ACCOUNT_SID,
    twilioAuthToken: TWILIO_AUTH_TOKEN,
    assistantId: VAPI_ASSISTANT_ID,
    name: `BellAveGo · ${row.business_name || row.user_id}`,
    serverUrl: `${NEXT_PUBLIC_APP_URL}/api/vapi/assistant-request`,
    ...(VAPI_WEBHOOK_SECRET ? { serverUrlSecret: VAPI_WEBHOOK_SECRET } : {}),
  }
  const res = await fetch('https://api.vapi.ai/phone-number', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (res.ok) {
    const j = await res.json()
    console.log(`  ✓ ${row.twilio_number}  →  ${j.id}  (${row.business_name || row.user_id})`)
    ok++
  } else {
    const text = await res.text()
    console.log(`  ✗ ${row.twilio_number}  →  HTTP ${res.status}: ${text.slice(0, 200)}`)
    fail++
  }
}

console.log('')
console.log(`Done. ${ok} imported, ${fail} failed.`)
if (fail > 0) process.exit(1)
