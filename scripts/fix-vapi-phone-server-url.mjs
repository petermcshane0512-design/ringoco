#!/usr/bin/env node
/**
 * Fix the demo phone number's serverUrl. It's currently pointing at
 * localhost:3000 (set during dev), which from Vapi's cloud is unreachable.
 * That's why assistantOverrides never reach Emma and she falls back to the
 * base assistant prompt ("home-service business" generic).
 *
 * Run:
 *   VAPI_API_KEY=<key> node scripts/fix-vapi-phone-server-url.mjs
 */
const KEY = process.env.VAPI_API_KEY
if (!KEY) { console.error('VAPI_API_KEY required'); process.exit(1) }

const PHONE_ID = '07cfce56-5e31-4e9e-be01-567128f7d7a6'
const NEW_URL  = 'https://www.bellavego.com/api/vapi/assistant-request'

const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

// 1. Show what's there now
const before = await fetch(`https://api.vapi.ai/phone-number/${PHONE_ID}`, { headers }).then(r => r.json())
console.log('BEFORE:', { id: before.id, number: before.number, serverUrl: before.serverUrl, assistantId: before.assistantId })

// 2. PATCH the serverUrl
const patchRes = await fetch(`https://api.vapi.ai/phone-number/${PHONE_ID}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ serverUrl: NEW_URL }),
})
const patched = await patchRes.json()
if (!patchRes.ok) { console.error('PATCH FAILED:', patchRes.status, patched); process.exit(1) }

// 3. Show what's there after
console.log('AFTER:',  { id: patched.id, number: patched.number, serverUrl: patched.serverUrl, assistantId: patched.assistantId })
console.log('OK')
