#!/usr/bin/env node
/**
 * ⚠️ SUPERSEDED 2026-05-22
 *
 * The real per-tenant provisioning pipeline now lives in
 * `provisionNumberForUser()` at src/lib/provisionNumber.ts. It runs
 * automatically on Stripe checkout.session.completed (no script
 * invocation needed) and is invokable for dry-runs via
 * /api/internal/test-provision (admin-gated).
 *
 * This file stays in the repo as architectural reference for what the
 * provisioning flow looks like in plain Node (no TS, no Next.js, no
 * Supabase client) — useful if we ever need to reprovision tenants
 * from a one-off CLI context. Do NOT call it in production.
 *
 * provision-tenant.mjs — SKELETON
 *
 * Provisions Vapi + Twilio resources for a paying contractor. Creates
 * a dedicated Vapi assistant per tenant (NOT a shared one with per-call
 * overrides — see docs/architecture/vapi-tenant-provisioning.md for the
 * rationale).
 *
 * Status: NOT IMPLEMENTED. This file is a skeleton with TODOs to guide
 * the eventual build. Do not call from production code until each TODO
 * has been resolved.
 *
 * Usage (planned):
 *   VAPI_API_KEY=<key> \
 *   NEXT_PUBLIC_SUPABASE_URL=<url> \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   TWILIO_ACCOUNT_SID=<sid> \
 *   TWILIO_AUTH_TOKEN=<token> \
 *     node scripts/provision-tenant.mjs <tenant_user_id>
 */

const TENANT_USER_ID = process.argv[2]
if (!TENANT_USER_ID) {
  console.error('Usage: node scripts/provision-tenant.mjs <tenant_user_id>')
  process.exit(1)
}

const VAPI_API_KEY = process.env.VAPI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!VAPI_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required env vars: VAPI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ─────────────────────────────────────────────────────────────
// STEP 1 — Load the tenant profile from Supabase
// ─────────────────────────────────────────────────────────────
async function loadProfile(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  )
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`)
  const rows = await res.json()
  if (!rows.length) throw new Error(`No profile for user_id=${userId}`)
  return rows[0]
}

// ─────────────────────────────────────────────────────────────
// STEP 2 — Render the personalized system prompt
// ─────────────────────────────────────────────────────────────
// TODO: Import or inline renderSystemPrompt(tenantContext) from
// src/lib/vapi.ts. Easiest approach: do the same regex-extract pattern
// scripts/bake-sales-prompt-into-assistant.mjs uses to slice the
// function body out of the TS source, then evaluate the template
// interpolation against the loaded profile.
// Alternative: compile lib/vapi.ts to .mjs at build time and require
// the compiled output. More robust but adds a build step.
function renderSystemPromptStub(profile) {
  // Placeholder — must be replaced with real renderSystemPrompt output.
  return `You are an AI receptionist for ${profile.business_name || 'this business'}. (STUB — replace with real renderSystemPrompt output)`
}

// ─────────────────────────────────────────────────────────────
// STEP 3 — Render the first message + spoken AI name
// ─────────────────────────────────────────────────────────────
function renderFirstMessage(profile, aiName) {
  const business = profile.business_name || 'us'
  const owner = profile.owner_first_name || 'the owner'
  if (profile.ai_language === 'es') {
    return `Hola, soy ${aiName} con ${business}. ${owner} está en un trabajo — ¿en qué le puedo ayudar?`
  }
  return `Hi, this is ${aiName} with ${business}. ${owner} is out on a job — how can I help?`
}

// TODO: Import getAiNameForVoice from src/lib/vapi.ts (same extraction
// approach as renderSystemPrompt). For now hardcoded fallback to 'Emma'.
function getAiNameStub(voiceId) {
  // Placeholder
  const map = {
    '156fb8d2-335b-4950-9cb3-a2d33befec77': 'Emma',
    'bf991597-6c13-47e4-8411-91ec2de5c466': 'Avery',
    '421b3369-f63f-4b03-8980-37a44df1d4e8': 'Marcus',
  }
  return map[voiceId] || 'Emma'
}

// ─────────────────────────────────────────────────────────────
// STEP 4 — Build tool definitions
// ─────────────────────────────────────────────────────────────
// TODO: Lift these from scripts/bake-sales-prompt-into-assistant.mjs.
// Keep the definitions in sync between scripts.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.bellavego.com'
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET

function buildTools() {
  // TODO: Real tool definitions — take_message, check_availability,
  // book_appointment with server.url pointing at our end-of-call-report
  // / calendar/availability / calendar/book endpoints.
  return []
}

// ─────────────────────────────────────────────────────────────
// STEP 5 — Create the Vapi assistant
// ─────────────────────────────────────────────────────────────
async function createVapiAssistant(profile) {
  const aiName = getAiNameStub(profile.ai_voice_id)
  const systemPrompt = renderSystemPromptStub(profile)
  const firstMessage = renderFirstMessage(profile, aiName)

  const config = {
    name: `BellAveGo · ${profile.business_name || profile.user_id}`,
    firstMessage,
    firstMessageMode: 'assistant-speaks-first',
    model: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      temperature: 0.6,
      maxTokens: 220,
      messages: [{ role: 'system', content: systemPrompt }],
      tools: buildTools(),
    },
    voice: {
      provider: 'cartesia',
      voiceId: profile.ai_voice_id || '156fb8d2-335b-4950-9cb3-a2d33befec77',
      model: 'sonic-english',
    },
    transcriber: { provider: 'deepgram', model: 'nova-3', language: 'en-US' },
    endCallFunctionEnabled: true,
    endCallMessage: "Got it — talk soon. Thanks for calling.",
    silenceTimeoutSeconds: 25,
    maxDurationSeconds: 600,
    backgroundDenoisingEnabled: true,
    recordingEnabled: true,
    serverUrl: `${APP_URL}/api/vapi/end-of-call-report`,
    ...(WEBHOOK_SECRET ? { serverUrlSecret: WEBHOOK_SECRET } : {}),
    serverMessages: ['end-of-call-report', 'tool-calls', 'status-update'],
    metadata: {
      // Embed user_id so end-of-call-report can route the tool call back
      // to the right tenant without a second lookup.
      user_id: profile.user_id,
      business_name: profile.business_name,
      plan_tier: profile.plan_tier,
    },
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
    const body = await res.text()
    throw new Error(`Vapi assistant create failed (${res.status}): ${body.slice(0, 200)}`)
  }
  return res.json()
}

// ─────────────────────────────────────────────────────────────
// STEP 6 — Provision the Twilio number (or reuse existing)
// ─────────────────────────────────────────────────────────────
// TODO: Either:
//   (a) Reuse profile.twilio_number if it was already purchased by
//       provisionNumberForUser() in src/lib/provisionNumber.ts —
//       just update its assistantId binding on Vapi via PATCH.
//   (b) Purchase a new one here. Probably (a) — Stripe webhook already
//       calls provisionNumberForUser; we just need to add the
//       assistantId binding step.
async function bindNumberToAssistant(profile, assistantId) {
  if (!profile.twilio_number) {
    throw new Error(
      'Twilio number not yet provisioned for tenant. Run provisionNumberForUser first.',
    )
  }
  // TODO: Find the existing Vapi phone-number record by the E.164
  // number, then PATCH it to set assistantId to the new assistant.
  // GET /phone-number?number=<E.164> → first match → PATCH /phone-number/{id}
  // with { assistantId }
  console.warn('TODO: bind phone number to assistant', profile.twilio_number, '→', assistantId)
}

// ─────────────────────────────────────────────────────────────
// STEP 7 — Persist the binding back to Supabase
// ─────────────────────────────────────────────────────────────
async function persistAssistantId(userId, assistantId) {
  // TODO: Add `vapi_assistant_id TEXT` column to profiles table first.
  // Until that migration runs, this UPDATE will fail silently.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ vapi_assistant_id: assistantId }),
    },
  )
  if (!res.ok) throw new Error(`Profile UPDATE failed: ${res.status}`)
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`Provisioning tenant ${TENANT_USER_ID}`)

  const profile = await loadProfile(TENANT_USER_ID)
  console.log(`  loaded profile: ${profile.business_name || '(no business name)'}`)

  // TODO: short-circuit if profile.vapi_assistant_id already exists —
  // either skip (idempotent) or PATCH the existing assistant.

  const assistant = await createVapiAssistant(profile)
  console.log(`  created Vapi assistant: ${assistant.id}`)

  await bindNumberToAssistant(profile, assistant.id)
  console.log(`  TODO: bound ${profile.twilio_number} → assistant ${assistant.id}`)

  await persistAssistantId(TENANT_USER_ID, assistant.id)
  console.log(`  persisted vapi_assistant_id to profile`)

  console.log(`Done. Tenant ${TENANT_USER_ID} provisioned.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
