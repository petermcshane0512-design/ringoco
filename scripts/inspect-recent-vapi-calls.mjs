#!/usr/bin/env node
/**
 * Inspect the last few Vapi calls to see whether assistantOverrides
 * actually reached Emma. Reveals 401s and base-config fallbacks.
 * Run: VAPI_API_KEY=<key> node scripts/inspect-recent-vapi-calls.mjs
 */
const KEY = process.env.VAPI_API_KEY
if (!KEY) { console.error('VAPI_API_KEY required'); process.exit(1) }
const headers = { Authorization: `Bearer ${KEY}` }

const res = await fetch('https://api.vapi.ai/call?limit=8', { headers })
const calls = await res.json()
if (!Array.isArray(calls)) { console.error('unexpected response:', calls); process.exit(1) }

for (const c of calls) {
  const ov = c.assistantOverrides
  const overrideFirstMsg = ov?.firstMessage || '(no override firstMessage)'
  const overrideSystemFirst = ov?.model?.messages?.[0]?.content?.slice(0, 100) || '(no override system)'
  console.log('─'.repeat(70))
  console.log(`call ${c.id}`)
  console.log(`  startedAt: ${c.startedAt}`)
  console.log(`  endedReason: ${c.endedReason}`)
  console.log(`  status: ${c.status}`)
  console.log(`  phoneNumberId: ${c.phoneNumberId}`)
  console.log(`  customer.number: ${c.customer?.number}`)
  console.log(`  assistantId: ${c.assistantId}`)
  console.log(`  assistantOverrides.firstMessage: ${overrideFirstMsg.slice(0, 120)}`)
  console.log(`  assistantOverrides.system[0..100]: ${overrideSystemFirst}`)
  if (c.transcript) console.log(`  transcript[0..200]: ${c.transcript.slice(0, 200).replace(/\n/g, ' | ')}`)
}
