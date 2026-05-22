#!/usr/bin/env node
/**
 * Configures the demo phone number's serverUrl + serverUrlSecret to
 * production values. Idempotent — safe to re-run.
 *
 * - serverUrl was previously pointing at localhost:3000 (set during dev),
 *   which is unreachable from Vapi's cloud, so assistantOverrides never
 *   reached Emma. Forces it to production.
 * - serverUrlSecret authenticates Vapi → BellAveGo webhook requests so
 *   verifyVapiSignature in lib/vapi.ts can stop falling open. When
 *   VAPI_WEBHOOK_SECRET is set in the environment running this script,
 *   it gets PATCHed onto the phone number too. When unset, only the URL
 *   change applies (the script still runs without the secret).
 *
 * Run:
 *   VAPI_API_KEY=<key> VAPI_WEBHOOK_SECRET=<secret> node scripts/fix-vapi-phone-server-url.mjs
 *
 * Or (secret optional):
 *   VAPI_API_KEY=<key> node scripts/fix-vapi-phone-server-url.mjs
 */
const KEY = process.env.VAPI_API_KEY
const SECRET = process.env.VAPI_WEBHOOK_SECRET
if (!KEY) { console.error('VAPI_API_KEY required'); process.exit(1) }

const PHONE_ID = '07cfce56-5e31-4e9e-be01-567128f7d7a6'
const NEW_URL  = 'https://www.bellavego.com/api/vapi/assistant-request'

const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const before = await fetch(`https://api.vapi.ai/phone-number/${PHONE_ID}`, { headers }).then(r => r.json())
console.log('BEFORE:', {
  id: before.id,
  number: before.number,
  serverUrl: before.serverUrl,
  serverUrlSecret: before.serverUrlSecret ? '(set)' : '(not set)',
  assistantId: before.assistantId,
})

const patch = { serverUrl: NEW_URL }
if (SECRET) patch.serverUrlSecret = SECRET
else console.warn('WARN: VAPI_WEBHOOK_SECRET not in env — only updating serverUrl, leaving secret unchanged.')

const patchRes = await fetch(`https://api.vapi.ai/phone-number/${PHONE_ID}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify(patch),
})
const patched = await patchRes.json()
if (!patchRes.ok) { console.error('PATCH FAILED:', patchRes.status, patched); process.exit(1) }

console.log('AFTER:', {
  id: patched.id,
  number: patched.number,
  serverUrl: patched.serverUrl,
  serverUrlSecret: patched.serverUrlSecret ? '(set)' : '(not set)',
  assistantId: patched.assistantId,
})
console.log('OK')
