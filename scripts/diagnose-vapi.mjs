#!/usr/bin/env node
/**
 * Vapi diagnostic — reads the current assistant + phone-number config from
 * the Vapi API so we can see why assistantOverrides aren't reaching Emma.
 *
 * Run:
 *   VAPI_API_KEY=<key> node scripts/diagnose-vapi.mjs > /tmp/vapi-diag.json
 *
 * (PowerShell equivalent: $env:VAPI_API_KEY="..."; node scripts/diagnose-vapi.mjs)
 *
 * No writes. Pure GET. Safe to run anytime.
 */

const KEY = process.env.VAPI_API_KEY
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || 'cccc9db9-7a6b-4211-b6b1-a68de8e21458'
const DEMO_E164 = process.env.TWILIO_DEMO_NUMBER || '+16514677829'

if (!KEY) {
  console.error('FATAL: VAPI_API_KEY env var not set.')
  console.error('Set it inline: VAPI_API_KEY=<key> node scripts/diagnose-vapi.mjs')
  process.exit(1)
}

const headers = { Authorization: `Bearer ${KEY}` }

async function get(path) {
  const res = await fetch(`https://api.vapi.ai${path}`, { headers })
  const body = await res.text()
  let parsed
  try { parsed = JSON.parse(body) } catch { parsed = body }
  return { status: res.status, body: parsed }
}

const out = {
  assistant_id_used: ASSISTANT_ID,
  demo_number_searched: DEMO_E164,
  env: {
    has_VAPI_API_KEY: !!process.env.VAPI_API_KEY,
    has_VAPI_ASSISTANT_ID: !!process.env.VAPI_ASSISTANT_ID,
    has_VAPI_WEBHOOK_SECRET: !!process.env.VAPI_WEBHOOK_SECRET,
    has_VAPI_SERVER_SECRET: !!process.env.VAPI_SERVER_SECRET,
    has_TWILIO_DEMO_NUMBER: !!process.env.TWILIO_DEMO_NUMBER,
    TWILIO_DEMO_NUMBER_value: process.env.TWILIO_DEMO_NUMBER || null,
  },
}

// 1. Assistant config
const a = await get(`/assistant/${ASSISTANT_ID}`)
if (a.status !== 200) {
  out.assistant_error = a
} else {
  out.assistant = {
    id: a.body.id,
    name: a.body.name,
    firstMessage: a.body.firstMessage,
    firstMessageMode: a.body.firstMessageMode,
    serverUrl: a.body.serverUrl || a.body.server?.url || null,
    serverUrlSecret: a.body.serverUrlSecret ? '(set)' : '(not set)',
    server_object: a.body.server ?? null,
    serverMessages: a.body.serverMessages,
    model_provider: a.body.model?.provider,
    model_name: a.body.model?.model,
    model_systemMessage_first120: (a.body.model?.messages?.[0]?.content || '').slice(0, 120),
    model_tools_count: a.body.model?.tools?.length || 0,
    model_tool_names: (a.body.model?.tools || []).map(t => t?.function?.name).filter(Boolean),
    voice_provider: a.body.voice?.provider,
    voice_voiceId: a.body.voice?.voiceId,
  }
}

// 2. Phone numbers
const pn = await get('/phone-number')
if (pn.status !== 200) {
  out.phone_numbers_error = pn
} else {
  const list = Array.isArray(pn.body) ? pn.body : []
  out.phone_numbers_total = list.length
  // Normalize: try to find the demo number by several common shapes
  const matchByE164 = list.find(p => p?.number === DEMO_E164 || p?.twilioPhoneNumber === DEMO_E164)
  out.demo_phone_number = matchByE164 ? {
    id: matchByE164.id,
    number: matchByE164.number,
    twilioPhoneNumber: matchByE164.twilioPhoneNumber,
    name: matchByE164.name,
    provider: matchByE164.provider,
    assistantId: matchByE164.assistantId,
    assistantId_matches_target: matchByE164.assistantId === ASSISTANT_ID,
    serverUrl: matchByE164.serverUrl || null,
    serverUrlSecret: matchByE164.serverUrlSecret ? '(set)' : '(not set)',
    server_object: matchByE164.server ?? null,
  } : null

  // Also list every number's id/number/serverUrl summary so we can spot the demo
  // even if our DEMO_E164 string didn't match exactly.
  out.all_phone_numbers_summary = list.map(p => ({
    id: p.id,
    number: p.number ?? p.twilioPhoneNumber ?? '(no-number-field)',
    name: p.name,
    assistantId: p.assistantId,
    has_serverUrl: !!(p.serverUrl || p.server?.url),
  }))
}

console.log(JSON.stringify(out, null, 2))
