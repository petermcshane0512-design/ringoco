import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { attachNumberToMessagingService, A2P_MESSAGING_SERVICE_SID } from './a2p'
import {
  vapiImportTwilioNumber,
  buildAssistantConfig,
  renderSystemPrompt,
  getAiNameForVoice,
  pronounceableBusinessName,
  VAPI_VOICE_PROVIDER,
  VAPI_VOICE_ID_DEFAULT,
  type TenantContext,
} from './vapi'

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// CRITICAL: must resolve to www.bellavego.com — the apex `bellavego.com`
// 307-redirects all requests to www, and Vapi (like most webhook senders)
// drops the request on a 307 redirect for POST. This silently broke every
// tool-call + end-of-call-report webhook from per-tenant assistants whose
// serverUrl baked in the non-www URL. We force `www.` regardless of what
// the env var says so a misconfigured Vercel env can never reintroduce
// the same outage.
function forceWww(url: string): string {
  return url.replace(/^https?:\/\/(?!www\.)(bellavego\.com)/i, 'https://www.$1')
}
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? forceWww(process.env.NEXT_PUBLIC_APP_URL)
    : 'https://www.bellavego.com'

function extractAreaCode(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4)
  if (digits.length === 10) return digits.slice(0, 3)
  return undefined
}

export type ProvisionResult =
  | {
      ok: true
      phoneNumber: string
      reused: boolean
      /**
       * The per-tenant Vapi assistant ID bound to this contractor's number.
       * Created at provision time, persisted to profiles.vapi_assistant_id.
       * Each contractor gets their own assistant resource — NOT the shared
       * sales assistant (VAPI_ASSISTANT_ID env, reserved for the demo line).
       */
      vapiAssistantId?: string
      /**
       * True when the Twilio number was purchased successfully but the Vapi
       * import step failed. Caller (Stripe webhook) should still send the
       * welcome SMS (the number works on the legacy Polly route) AND record
       * a provisioning_failures row so the retry cron re-attempts the Vapi
       * import and Peter is alerted to investigate.
       */
      vapiImportFailed?: boolean
      vapiImportError?: string
    }
  | { ok: false; error: string }

/**
 * Subset of profile columns read for provisioning. Keeping this typed
 * lets createPerTenantAssistant() consume it cleanly without re-fetching.
 */
type ProvisionableProfile = {
  user_id: string
  twilio_number: string | null
  owner_phone: string | null
  backup_owner_phone: string | null
  owner_first_name: string | null
  business_name: string | null
  services: string | null
  service_area: string | null
  ai_voice_id: string | null
  ai_tone: string | null
  ai_language: string | null
  custom_prompt_notes: string | null
  plan_tier: string | null
  vapi_phone_number_id: string | null
  vapi_assistant_id: string | null
  vapi_import_failed_at: string | null
}

/**
 * Create a dedicated Vapi assistant for one contractor. The assistant's
 * model.messages[0] is renderSystemPrompt(tenant) — the contractor's
 * business name, services, owner first name, custom notes baked in.
 *
 * Per-tenant: each contractor gets their own assistant resource in Vapi.
 * Their Twilio number gets bound to this assistant via vapiImportTwilioNumber,
 * so when a homeowner calls, Vapi uses THIS assistant's config directly —
 * no webhook overrides needed (Vapi's override pipeline doesn't apply our
 * responses reliably; see docs/architecture/vapi-tenant-provisioning.md).
 *
 * The shared sales assistant (VAPI_ASSISTANT_ID env, cccc9db9-...) is
 * NEVER bound here. It serves the demo line only.
 *
 * Inherits tools + transcriber + guardrails from buildAssistantConfig so
 * tool definitions stay unified between the shared demo assistant and
 * per-tenant assistants (no drift).
 *
 * Throws on Vapi API failure — caller handles by writing the error to
 * profiles.vapi_assistant_creation_error and bailing before any Twilio
 * spend. We do NOT silently fall back to the shared assistant; that would
 * route this contractor's customers to the BellAveGo sales pitch.
 */
async function createPerTenantAssistant(profile: ProvisionableProfile): Promise<{ id: string }> {
  if (!process.env.VAPI_API_KEY) {
    throw new Error('VAPI_API_KEY not set')
  }

  const voiceId = profile.ai_voice_id || VAPI_VOICE_ID_DEFAULT
  const aiName = getAiNameForVoice(voiceId)

  const tenant: TenantContext = {
    userId: profile.user_id,
    businessName: profile.business_name || 'the business',
    ownerFirstName: profile.owner_first_name,
    services: profile.services,
    serviceArea: profile.service_area,
    aiTone: profile.ai_tone,
    aiLanguage: profile.ai_language,
    customPromptNotes: profile.custom_prompt_notes,
    planTier: profile.plan_tier,
    twilioNumber: profile.twilio_number,
    aiName,
    // Calendar connection state is unknown at provision time — false is
    // the safe default (Emma takes messages, doesn't try to book). When
    // the contractor connects a calendar later, /api/calendar/oauth-callback
    // will need to re-PATCH this assistant with hasCalendarConnected=true
    // so the prompt unlocks check_availability / book_appointment.
    hasCalendarConnected: false,
  }

  const systemPrompt = renderSystemPrompt(tenant)
  // Spoken brand name — Cartesia TTS reads "BellAveGo" as "BelAvco". Pass the
  // pronounceable form so it says "Bell Ave Go" cleanly. The literal name
  // stays for SMS/email/DB writes elsewhere.
  const business = pronounceableBusinessName(tenant.businessName || 'the business')
  const owner = tenant.ownerFirstName || 'the owner'
  const firstMessage =
    tenant.aiLanguage === 'es'
      ? `Hola, soy ${aiName} con ${business}. ${owner} está en un trabajo — ¿en qué le puedo ayudar?`
      : `Hi, this is ${aiName} with ${business}. ${owner} is out on a job — how can I help?`

  // Inherit tools + transcriber + guardrails + serverUrl + serverMessages
  // from the canonical config; override only the tenant-specific fields.
  // Keeps tool/transcriber definitions in ONE place so they don't drift
  // between the shared demo assistant and per-tenant assistants.
  const baseConfig = buildAssistantConfig({
    appBaseUrl: APP_URL,
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
  })

  const config = {
    ...baseConfig,
    name: `BellAveGo · ${tenant.businessName}`,
    firstMessage,
    model: {
      ...baseConfig.model,
      messages: [{ role: 'system' as const, content: systemPrompt }],
    },
    voice: {
      provider: VAPI_VOICE_PROVIDER,
      voiceId,
      model: 'sonic-english',
    },
    // user_id in metadata is how /api/vapi/end-of-call-report routes
    // tool calls back to the right tenant — Vapi includes assistant.metadata
    // in every server webhook. Survives the override-pipeline bug.
    //
    // owner_phone + backup_owner_phone + owner_first_name MUST be baked here
    // — without them, takeMessage() falls back to FALLBACK_OWNER_PHONE env
    // (Peter's cell), so EVERY tenant's lead-alert SMS would land on Peter's
    // phone instead of the actual contractor. Owner cell + business name +
    // tier are the four facts the webhook needs and they don't change call-
    // to-call. (If owner edits cell later, /api/profile fires
    // repatchPerTenantAssistant which mirrors this metadata.)
    metadata: {
      user_id: profile.user_id,
      business_name: tenant.businessName,
      plan_tier: tenant.planTier ?? null,
      owner_phone: profile.owner_phone ?? null,
      backup_owner_phone: (profile as { backup_owner_phone?: string | null }).backup_owner_phone ?? null,
      owner_first_name: profile.owner_first_name ?? null,
      twilio_number: profile.twilio_number ?? null,
    },
  }

  const res = await fetch('https://api.vapi.ai/assistant', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Vapi assistant create failed (${res.status}): ${body.slice(0, 200)}`)
  }
  return (await res.json()) as { id: string }
}

/**
 * Re-PATCH an existing per-tenant Vapi assistant with the latest profile data.
 * Used when a contractor edits their dashboard settings (business name,
 * services, ai_tone, ai_voice_id, ai_language, custom_prompt_notes) — without
 * this, the saved fields hit Supabase but the live Vapi assistant still uses
 * the prompt baked in at provision time. Their NEXT call would still hear the
 * OLD prompt until manual re-bake.
 *
 * Fire-and-forget from /api/profile POST. Caller doesn't await the result —
 * we don't want a slow Vapi round-trip to delay the settings-save UX.
 *
 * Idempotent: re-running with the same profile data is a no-op for the AI
 * (same prompt) and consumes one Vapi API call. Cheap.
 *
 * Returns { ok: true } when the PATCH succeeds, { ok: false, reason } when
 * skipped (no assistant yet, no API key) or failed (network / Vapi error).
 * Errors are logged but never thrown — settings save must not break on Vapi
 * outage.
 */
export async function repatchPerTenantAssistant(
  userId: string,
): Promise<{ ok: true; assistantId: string } | { ok: false; reason: string }> {
  if (!process.env.VAPI_API_KEY) {
    return { ok: false, reason: 'VAPI_API_KEY not set' }
  }

  // Load fresh profile — same column set as provisionNumberForUser uses.
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select(
      'user_id, twilio_number, owner_phone, backup_owner_phone, owner_first_name, business_name, ' +
        'services, service_area, ai_voice_id, ai_tone, ai_language, ' +
        'custom_prompt_notes, plan_tier, vapi_phone_number_id, ' +
        'vapi_assistant_id, vapi_import_failed_at',
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (pErr || !profile) {
    return { ok: false, reason: pErr?.message || 'profile not found' }
  }
  const p = profile as unknown as ProvisionableProfile
  if (!p.vapi_assistant_id) {
    // No assistant yet — nothing to repatch. Will be picked up the next time
    // provisionNumberForUser runs (Stripe webhook, manual provision, or
    // provision-retry cron).
    return { ok: false, reason: 'no vapi_assistant_id on profile yet' }
  }

  // Build the same config createPerTenantAssistant builds — but for an
  // existing assistant we send only the mutable fields to keep the PATCH
  // surface narrow. tools + transcriber + serverUrl etc. are unchanged
  // by a settings edit and don't need to be re-sent.
  const voiceId = p.ai_voice_id || VAPI_VOICE_ID_DEFAULT
  const aiName = getAiNameForVoice(voiceId)
  const tenant: TenantContext = {
    userId: p.user_id,
    businessName: p.business_name || 'the business',
    ownerFirstName: p.owner_first_name,
    services: p.services,
    serviceArea: p.service_area,
    aiTone: p.ai_tone,
    aiLanguage: p.ai_language,
    customPromptNotes: p.custom_prompt_notes,
    planTier: p.plan_tier,
    twilioNumber: p.twilio_number,
    aiName,
    hasCalendarConnected: false,
  }
  const systemPrompt = renderSystemPrompt(tenant)
  // Spoken brand name — Cartesia TTS reads "BellAveGo" as "BelAvco". Pass the
  // pronounceable form so it says "Bell Ave Go" cleanly. The literal name
  // stays for SMS/email/DB writes elsewhere.
  const business = pronounceableBusinessName(tenant.businessName || 'the business')
  const owner = tenant.ownerFirstName || 'the owner'
  const firstMessage =
    tenant.aiLanguage === 'es'
      ? `Hola, soy ${aiName} con ${business}. ${owner} está en un trabajo — ¿en qué le puedo ayudar?`
      : `Hi, this is ${aiName} with ${business}. ${owner} is out on a job — how can I help?`

  // Vapi PATCH REPLACES nested objects (model, voice). We only PATCH the fields
  // that depend on profile data — name, firstMessage, model.messages (system
  // prompt), voice, metadata. Tools live on model.tools so when we PATCH model
  // we MUST include the tools array or they'll be wiped (verified bug — see
  // scripts/bake-sales-prompt-into-assistant.mjs comment).
  const baseConfig = buildAssistantConfig({
    appBaseUrl: APP_URL,
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
  })
  // Spread baseConfig.voice so all new voice flags (fillerInjectionEnabled,
  // future ones) propagate to existing assistants on repatch — without this,
  // editing a contractor's profile would update the prompt but leave the
  // voice config frozen at whatever was baked in when the assistant was
  // first created.
  const patchBody = {
    name: `BellAveGo · ${tenant.businessName}`,
    firstMessage,
    model: {
      ...baseConfig.model,
      messages: [{ role: 'system' as const, content: systemPrompt }],
    },
    voice: {
      ...baseConfig.voice,
      voiceId, // tenant-specific override
    },
    metadata: {
      user_id: p.user_id,
      business_name: tenant.businessName,
      plan_tier: tenant.planTier ?? null,
      // Keep owner_phone / backup_owner_phone / owner_first_name in sync —
      // if the contractor edits any of these on /dashboard/settings, repatch
      // mirrors them into the baked assistant metadata so the next call's
      // webhook routes SMS to the updated cell. Mirror of createPerTenantAssistant
      // (provisionNumber.ts lines ~167-175) — drift between the two would cause
      // /api/profile updates to silently lag the call-routing behavior.
      owner_phone: p.owner_phone ?? null,
      backup_owner_phone: p.backup_owner_phone ?? null,
      owner_first_name: p.owner_first_name ?? null,
      twilio_number: p.twilio_number ?? null,
    },
  }

  try {
    const res = await fetch(`https://api.vapi.ai/assistant/${p.vapi_assistant_id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchBody),
    })
    if (!res.ok) {
      const body = await res.text()
      const msg = `Vapi assistant PATCH failed (${res.status}): ${body.slice(0, 200)}`
      console.error(`repatchPerTenantAssistant for ${userId}:`, msg)
      return { ok: false, reason: msg }
    }
    return { ok: true, assistantId: p.vapi_assistant_id }
  } catch (e) {
    const msg = (e as Error).message
    console.error(`repatchPerTenantAssistant for ${userId} threw:`, msg)
    return { ok: false, reason: msg }
  }
}

/**
 * Switch a contractor's per-tenant Vapi assistant into "capacity mode"
 * because they've crossed their monthly call cap. Sends a polite hangup
 * message instead of running the full receptionist flow.
 *
 * Mechanism: PATCH the assistant's firstMessage + system prompt +
 * maxDurationSeconds + endCallFunctionEnabled. Tools array MUST be
 * re-included in model.tools because Vapi PATCH replaces nested objects
 * (we discovered this earlier — see bake-sales-prompt-into-assistant.mjs).
 *
 * Called from /api/vapi/end-of-call-report after a call ends and the
 * contractor's month-to-date count crosses their cap. Also stamps
 * profiles.capacity_mode_at so /api/crons/reset-monthly-caps knows to
 * restore this assistant on the 1st of next month.
 *
 * Idempotent: calling on an already-capacity-mode assistant just sends
 * the same PATCH again. Cheap. Safe.
 */
export async function switchToCapacityMode(
  userId: string,
): Promise<{ ok: true; assistantId: string } | { ok: false; reason: string }> {
  if (!process.env.VAPI_API_KEY) {
    return { ok: false, reason: 'VAPI_API_KEY not set' }
  }

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, business_name, owner_first_name, vapi_assistant_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (pErr || !profile) {
    return { ok: false, reason: pErr?.message || 'profile not found' }
  }
  const p = profile as unknown as {
    user_id: string
    business_name: string | null
    owner_first_name: string | null
    vapi_assistant_id: string | null
  }
  if (!p.vapi_assistant_id) {
    return { ok: false, reason: 'no vapi_assistant_id' }
  }

  const business = p.business_name || 'us'
  const owner = p.owner_first_name || 'the owner'

  // Inherit tools + transcriber + guardrails from baseConfig so we
  // don't wipe the tools array (Vapi PATCH replaces nested objects).
  const baseConfig = buildAssistantConfig({
    appBaseUrl: APP_URL,
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
  })

  const capacityPrompt =
    `You are Emma, the AI receptionist for ${business}. ` +
    `${owner} has reached the monthly call capacity for our AI receptionist service. ` +
    `Your ONLY job on this call:\n\n` +
    `1. Politely tell the caller: "Hi, this is Emma with ${business}. ${owner} has hit ` +
    `our monthly call capacity for AI receptionist service. Please call back after the ` +
    `1st of the month, or text this number if it's truly urgent. Thanks for calling."\n` +
    `2. End the call. Do NOT take a message, do NOT offer to book, do NOT ask questions. ` +
    `Just deliver the message and hang up.\n\n` +
    `HARD RULES:\n` +
    `- Do not call take_message under any circumstances.\n` +
    `- Do not call check_availability or book_appointment.\n` +
    `- Keep your response under 20 seconds of speaking.`

  const patchBody = {
    firstMessage:
      `Hi, this is Emma with ${business}. ${owner} has hit our monthly call capacity for AI ` +
      `receptionist service. Please call back after the 1st of the month, or text this ` +
      `number if it's urgent. Thanks for calling.`,
    model: {
      ...baseConfig.model,
      messages: [{ role: 'system' as const, content: capacityPrompt }],
    },
    maxDurationSeconds: 30,
    silenceTimeoutSeconds: 8,
    endCallFunctionEnabled: false,
    endCallMessage: 'Thanks for calling — goodbye.',
  }

  try {
    const res = await fetch(`https://api.vapi.ai/assistant/${p.vapi_assistant_id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchBody),
    })
    if (!res.ok) {
      const body = await res.text()
      const msg = `Vapi PATCH (capacity mode) failed (${res.status}): ${body.slice(0, 200)}`
      console.error(`switchToCapacityMode for ${userId}:`, msg)
      return { ok: false, reason: msg }
    }
    // Stamp the column so the reset cron knows to restore later.
    await supabase
      .from('profiles')
      .update({ capacity_mode_at: new Date().toISOString() })
      .eq('user_id', userId)
    console.log(`[capacity-mode] ${userId} → switched to capacity mode (assistant ${p.vapi_assistant_id})`)
    return { ok: true, assistantId: p.vapi_assistant_id }
  } catch (e) {
    const msg = (e as Error).message
    console.error(`switchToCapacityMode for ${userId} threw:`, msg)
    return { ok: false, reason: msg }
  }
}

/**
 * Auto-deprovision a cancelled contractor — release Twilio number,
 * delete Vapi assistant + phone-number binding, clear DB columns.
 *
 * Called from the Stripe customer.subscription.deleted webhook so we
 * stop paying ~$1.15/mo Twilio rental + Vapi rental on orphaned
 * accounts as soon as the customer cancels.
 *
 * NOT idempotent on intent — once deprovisioned, the user can't get
 * the same Twilio number back. If they reactivate within 30 days they
 * get a fresh number. Acceptable: most cancellations don't return,
 * and Twilio doesn't reserve released numbers anyway.
 *
 * Best-effort across vendors — if Vapi delete fails but Twilio
 * release succeeds, we still mark the DB clean. Worst case is one
 * orphan Vapi assistant ($0/mo at rest) that Peter can clean up
 * manually later.
 *
 * Order: Vapi first (free + reversible), Twilio second (costs us
 * money until released). If Twilio fails, the Vapi delete still
 * happened, so we email Peter to manually release Twilio.
 */
export async function deprovisionForUser(
  userId: string,
): Promise<{
  ok: boolean
  vapiAssistantDeleted: boolean
  vapiPhoneNumberDeleted: boolean
  twilioNumberReleased: boolean
  errors: string[]
}> {
  const errors: string[] = []
  let vapiAssistantDeleted = false
  let vapiPhoneNumberDeleted = false
  let twilioNumberReleased = false

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, twilio_number, vapi_assistant_id, vapi_phone_number_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (pErr || !profile) {
    return { ok: false, vapiAssistantDeleted, vapiPhoneNumberDeleted, twilioNumberReleased, errors: [pErr?.message || 'profile not found'] }
  }
  const p = profile as unknown as {
    user_id: string
    twilio_number: string | null
    vapi_assistant_id: string | null
    vapi_phone_number_id: string | null
  }

  // Step 1: delete Vapi phone-number binding (must come before assistant
  // so we don't orphan a number pointing at a deleted assistant).
  if (p.vapi_phone_number_id && process.env.VAPI_API_KEY) {
    try {
      const r = await fetch(`https://api.vapi.ai/phone-number/${p.vapi_phone_number_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      })
      if (r.ok || r.status === 404) {
        vapiPhoneNumberDeleted = true
      } else {
        errors.push(`Vapi phone-number DELETE ${r.status}: ${(await r.text()).slice(0, 120)}`)
      }
    } catch (e) {
      errors.push(`Vapi phone-number DELETE threw: ${(e as Error).message}`)
    }
  }

  // Step 2: delete Vapi assistant
  if (p.vapi_assistant_id && process.env.VAPI_API_KEY) {
    try {
      const r = await fetch(`https://api.vapi.ai/assistant/${p.vapi_assistant_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      })
      if (r.ok || r.status === 404) {
        vapiAssistantDeleted = true
      } else {
        errors.push(`Vapi assistant DELETE ${r.status}: ${(await r.text()).slice(0, 120)}`)
      }
    } catch (e) {
      errors.push(`Vapi assistant DELETE threw: ${(e as Error).message}`)
    }
  }

  // Step 3: release Twilio number (costs $1.15/mo until released)
  if (p.twilio_number) {
    try {
      const list = await twilioClient.incomingPhoneNumbers.list({ phoneNumber: p.twilio_number, limit: 1 })
      const sid = list[0]?.sid
      if (sid) {
        await twilioClient.incomingPhoneNumbers(sid).remove()
        twilioNumberReleased = true
      } else {
        errors.push(`Twilio number ${p.twilio_number} not found in account (already released?)`)
        twilioNumberReleased = true // treat as success — nothing to release
      }
    } catch (e) {
      errors.push(`Twilio release threw: ${(e as Error).message}`)
    }
  }

  // Step 4: clear DB columns so the user can re-signup cleanly
  await supabase
    .from('profiles')
    .update({
      twilio_number: null,
      vapi_assistant_id: null,
      vapi_phone_number_id: null,
      vapi_import_failed_at: null,
      vapi_import_error: null,
      a2p_messaging_service_sid: null,
      a2p_brand_status: null,
    })
    .eq('user_id', userId)

  const ok = errors.length === 0
  console.log(`[deprovision] ${userId} → ${ok ? 'OK' : 'PARTIAL'} vapi-pn=${vapiPhoneNumberDeleted} vapi-asst=${vapiAssistantDeleted} twilio=${twilioNumberReleased} errors=${errors.length}`)
  return { ok, vapiAssistantDeleted, vapiPhoneNumberDeleted, twilioNumberReleased, errors }
}

/**
 * Restore a contractor's assistant from capacity mode back to normal.
 * Re-runs renderSystemPrompt(tenant) via repatchPerTenantAssistant
 * (which already exists), then clears profiles.capacity_mode_at.
 *
 * Called by /api/crons/reset-monthly-caps on the 1st of each month.
 */
export async function restoreFromCapacityMode(
  userId: string,
): Promise<{ ok: true; assistantId: string } | { ok: false; reason: string }> {
  const repatch = await repatchPerTenantAssistant(userId)
  if (!repatch.ok) {
    return { ok: false, reason: repatch.reason }
  }
  await supabase
    .from('profiles')
    .update({ capacity_mode_at: null })
    .eq('user_id', userId)
  console.log(`[capacity-mode] ${userId} → restored to normal mode (assistant ${repatch.assistantId})`)
  return repatch
}

/**
 * Idempotent per-tenant provisioning. Operation order (per Peter's spec):
 *
 *   1. Create per-tenant Vapi assistant FIRST (cheapest step that can fail)
 *   2. Buy Twilio number SECOND (the only step that costs real money)
 *   3. Bind Twilio number to the per-tenant assistant THIRD
 *   4. UPDATE profiles row FOURTH (twilio_number, vapi_phone_number_id, is_active)
 *
 * Why this order: Twilio purchase is ~$1.15/mo per number. We never want
 * to spend that if Vapi is down. The assistant + DB writes are free; if
 * they fail we bail before any Twilio spend.
 *
 * Idempotency: each step short-circuits if the relevant column on profiles
 * is already populated. A retry after partial failure re-uses what was
 * already provisioned — no duplicate assistants, no duplicate numbers.
 *
 * Orphan-state handling (see commit message + diff write-up for details):
 *   - Assistant created, Twilio purchase fails → assistant ID persisted
 *     to profiles.vapi_assistant_id before Twilio is attempted; retry
 *     reuses it. Surfaces as ok:false with explicit "orphan assistant
 *     reusable on retry" in error.
 *   - Assistant created + Twilio bought + bound, final DB UPDATE fails →
 *     Vapi-side state is consistent (assistant ↔ number bound); only the
 *     DB's `twilio_number` / `vapi_phone_number_id` columns are missing.
 *     Surfaces as ok:false with explicit "orphan binding" in error and
 *     identifies the bound resources by ID for manual reconcile.
 *   - Assistant create itself fails → vapi_assistant_creation_error
 *     column populated; no Twilio purchase; ok:false. NEVER falls back
 *     to the shared sales assistant (would route customers to the
 *     BellAveGo sales pitch).
 */
export async function provisionNumberForUser(userId: string): Promise<ProvisionResult> {
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select(
      'user_id, twilio_number, owner_phone, backup_owner_phone, owner_first_name, business_name, ' +
        'services, service_area, ai_voice_id, ai_tone, ai_language, ' +
        'custom_prompt_notes, plan_tier, vapi_phone_number_id, ' +
        'vapi_assistant_id, vapi_import_failed_at',
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (pErr || !profile) return { ok: false, error: 'profile not found' }

  // Cast through `unknown` because Supabase's auto-generated schema
  // types don't yet include vapi_assistant_id /
  // vapi_assistant_creation_error (we added them in sql/2026-05-22-add-vapi-assistant-id.sql
  // but haven't regenerated types). Runtime shape matches the SELECT.
  const p = profile as unknown as ProvisionableProfile

  // Fully provisioned — return reused.
  if (p.twilio_number && p.vapi_assistant_id && p.vapi_phone_number_id) {
    return {
      ok: true,
      phoneNumber: p.twilio_number,
      reused: true,
      vapiAssistantId: p.vapi_assistant_id,
    }
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 1 — Create per-tenant Vapi assistant FIRST
  // ─────────────────────────────────────────────────────────────
  // Cheapest step that can fail. Bail before spending money on a Twilio
  // number if Vapi is down or rate-limiting. Idempotent — skips if
  // profile already has an assistant ID from a prior partial run.
  let assistantId = p.vapi_assistant_id
  if (!assistantId) {
    try {
      const created = await createPerTenantAssistant(p)
      assistantId = created.id
    } catch (e) {
      const msg = (e as Error).message
      console.error(`Per-tenant assistant create failed for ${userId}:`, e)
      await supabase
        .from('profiles')
        .update({ vapi_assistant_creation_error: msg })
        .eq('user_id', userId)
      // Bail loudly — do NOT proceed to Twilio purchase. Better to fail
      // than to silently route the contractor's customers to the wrong
      // (shared sales) assistant.
      return { ok: false, error: `assistant creation failed: ${msg}` }
    }

    // Persist the new assistant ID IMMEDIATELY so subsequent failures
    // (Twilio, A2P, Vapi import, final UPDATE) don't orphan the assistant.
    // On retry we'll find this ID and reuse it instead of creating a
    // duplicate. Clear any previous error column.
    const { error: aErr } = await supabase
      .from('profiles')
      .update({
        vapi_assistant_id: assistantId,
        vapi_assistant_creation_error: null,
      })
      .eq('user_id', userId)
    if (aErr) {
      // Edge case: assistant exists on Vapi but our DB couldn't record
      // it. Without DB knowledge of this ID we'd create a duplicate on
      // every retry — surface loudly and require manual reconcile.
      return {
        ok: false,
        error:
          `assistant DB persist failed: ${aErr.message} ` +
          `(orphan assistant ${assistantId} exists on Vapi but profiles row doesn't know — manual reconcile needed)`,
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 1.5 — Reconcile orphan binding (retry path only)
  // ─────────────────────────────────────────────────────────────
  // Closes scenario 2 of the failure-mode analysis: assistant created +
  // Twilio bought + Vapi binding established, then the final Supabase
  // UPDATE failed → Vapi-side state is ahead of our DB. Without this
  // guard, the next retry would happily buy a SECOND Twilio number,
  // orphaning the first and costing the contractor an extra $1.15/mo.
  //
  // Gate: only runs when we ENTERED this call with an existing
  // assistant ID AND we don't yet have a Twilio number in our DB.
  // First-time provisions skip this (we just created the assistant
  // ourselves in STEP 1, so we know nothing is bound yet — save ~200ms).
  //
  // Defensive: if Vapi somehow returns multiple phone-numbers for one
  // assistant (shouldn't happen in our setup but we won't panic if it
  // does), we log + use the first one.
  //
  // On lookup failure (Vapi rate-limited, transient error), we log a
  // warning and proceed to STEP 2. Worst case is the pre-guard behavior
  // — a duplicate Twilio purchase on the rare race. Better than crashing
  // the retry entirely.
  const enteredWithExistingAssistant = !!p.vapi_assistant_id
  if (enteredWithExistingAssistant && !p.twilio_number && process.env.VAPI_API_KEY) {
    try {
      const lookupRes = await fetch(
        `https://api.vapi.ai/phone-number?assistantId=${encodeURIComponent(assistantId)}`,
        { headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` } },
      )
      if (lookupRes.ok) {
        const phoneNumbers = (await lookupRes.json()) as Array<{
          id?: string
          number?: string
          assistantId?: string
        }>
        if (Array.isArray(phoneNumbers) && phoneNumbers.length > 0) {
          if (phoneNumbers.length > 1) {
            console.warn(
              `[provisionNumber] Vapi returned ${phoneNumbers.length} phone numbers for ` +
                `assistant ${assistantId} (expected 1). Using first. IDs: ` +
                phoneNumbers.map((pn) => pn.id || '?').join(', '),
            )
          }
          const orphan = phoneNumbers[0]
          if (orphan.number && orphan.id) {
            console.log(
              `[provisionNumber] orphan binding detected for ${userId}: ` +
                `assistant ${assistantId} is already bound to ${orphan.number} ` +
                `(phone-number ${orphan.id}) on Vapi. Skipping Twilio purchase, reconciling DB.`,
            )
            const { error: rErr } = await supabase
              .from('profiles')
              .update({
                twilio_number: orphan.number,
                vapi_phone_number_id: orphan.id,
                is_active: true,
                vapi_import_failed_at: null,
                vapi_import_error: null,
              })
              .eq('user_id', userId)
            if (rErr) {
              return {
                ok: false,
                error:
                  `reconcile DB update failed: ${rErr.message} ` +
                  `(assistant ${assistantId} is bound to ${orphan.number} on Vapi but DB still doesn't reflect this — same orphan state, manual reconcile needed)`,
              }
            }
            return {
              ok: true,
              phoneNumber: orphan.number,
              reused: true,
              vapiAssistantId: assistantId,
            }
          }
        }
        // Empty array → no orphan binding. Fall through to STEP 2.
      } else {
        console.warn(
          `[provisionNumber] orphan-binding lookup failed (HTTP ${lookupRes.status}) — ` +
            `proceeding with STEP 2 (Twilio purchase). May produce a duplicate number on rare race.`,
        )
      }
    } catch (e) {
      console.warn(
        `[provisionNumber] orphan-binding lookup threw — proceeding with STEP 2:`,
        e,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 2 — Buy the Twilio number SECOND (or reuse if already bought)
  // ─────────────────────────────────────────────────────────────
  let phoneNumber = p.twilio_number
  let purchasedSid: string | null = null
  if (!phoneNumber) {
    const ownerAreaCode = extractAreaCode(p.owner_phone)
    let candidates: { phoneNumber: string }[] = []
    if (ownerAreaCode) {
      try {
        candidates = await twilioClient
          .availablePhoneNumbers('US')
          .local.list({ areaCode: parseInt(ownerAreaCode, 10), smsEnabled: true, voiceEnabled: true, limit: 5 })
      } catch (e) {
        console.warn('areaCode search failed, falling back:', e)
      }
    }
    if (candidates.length === 0) {
      try {
        candidates = await twilioClient
          .availablePhoneNumbers('US')
          .local.list({ smsEnabled: true, voiceEnabled: true, limit: 5 })
      } catch (e) {
        return { ok: false, error: `availability search failed: ${(e as Error).message}` }
      }
    }
    if (candidates.length === 0) return { ok: false, error: 'no numbers available' }

    try {
      const purchased = await twilioClient.incomingPhoneNumbers.create({
        phoneNumber: candidates[0].phoneNumber,
        voiceUrl: `${APP_URL}/api/twilio/voice`,
        voiceMethod: 'POST',
        smsUrl: `${APP_URL}/api/twilio/sms`,
        smsMethod: 'POST',
        friendlyName: `BellAveGo · ${p.business_name || p.user_id}`,
      })
      phoneNumber = purchased.phoneNumber
      purchasedSid = purchased.sid
    } catch (e) {
      // Twilio purchase failed after assistant creation succeeded. The
      // assistant is orphaned in Vapi but we already persisted its ID
      // to profiles.vapi_assistant_id — on retry STEP 1 short-circuits
      // and we try Twilio again. No duplicate assistant created.
      return {
        ok: false,
        error:
          `purchase failed: ${(e as Error).message} ` +
          `(orphan assistant ${assistantId} persisted on profile — retry reuses it)`,
      }
    }
  }

  // ── A2P attach (non-fatal — voice works without it) ──
  const a2pUpdate: Record<string, string | null> = {}
  if (purchasedSid && A2P_MESSAGING_SERVICE_SID) {
    const attach = await attachNumberToMessagingService(purchasedSid)
    if (attach.ok) {
      a2pUpdate.a2p_messaging_service_sid = A2P_MESSAGING_SERVICE_SID
      a2pUpdate.a2p_brand_status = 'approved'
    } else {
      console.warn(`A2P attach failed for ${phoneNumber}: ${attach.error}`)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 3 — Bind Twilio number to the PER-TENANT assistant
  // ─────────────────────────────────────────────────────────────
  // Uses `assistantId` (the per-tenant one we created in STEP 1), NOT
  // VAPI_ASSISTANT_ID (the shared sales assistant). This is the
  // critical change vs the pre-pivot architecture — every tenant used
  // to bind to the shared assistant and hear the BellAveGo sales pitch.
  let vapiImportFailureMessage: string | null = null
  let vapiPhoneNumberId: string | null = p.vapi_phone_number_id ?? null
  if (!vapiPhoneNumberId) {
    if (!process.env.VAPI_API_KEY) {
      vapiImportFailureMessage = 'VAPI_API_KEY missing — Vapi import skipped'
      console.error(vapiImportFailureMessage)
    } else {
      try {
        const imp = await vapiImportTwilioNumber({
          twilioPhoneNumber: phoneNumber,
          twilioAccountSid: process.env.TWILIO_ACCOUNT_SID!,
          twilioAuthToken: process.env.TWILIO_AUTH_TOKEN!,
          assistantId,
          serverUrl: `${APP_URL}/api/vapi/assistant-request`,
          serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
          friendlyName: `BellAveGo · ${p.business_name || p.user_id}`,
        })
        vapiPhoneNumberId = imp.id
      } catch (e) {
        vapiImportFailureMessage = (e as Error).message
        console.error(
          `Vapi import failed — assistant ${assistantId} not bound to ${phoneNumber}:`,
          e,
        )
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 4 — Final UPDATE
  // ─────────────────────────────────────────────────────────────
  const update: Record<string, string | boolean | null> = {
    twilio_number: phoneNumber,
    is_active: true,
    ...a2pUpdate,
  }
  if (vapiPhoneNumberId) {
    update.vapi_phone_number_id = vapiPhoneNumberId
    update.vapi_import_failed_at = null
    update.vapi_import_error = null
  } else if (vapiImportFailureMessage) {
    update.vapi_import_failed_at = new Date().toISOString()
    update.vapi_import_error = vapiImportFailureMessage
  }

  const { error: uErr } = await supabase
    .from('profiles')
    .update(update)
    .eq('user_id', userId)

  if (uErr) {
    return {
      ok: false,
      error:
        `db update failed: ${uErr.message} ` +
        `(orphan binding — Vapi has assistant ${assistantId} bound to ${phoneNumber}` +
        `${vapiPhoneNumberId ? ` as phone-number ${vapiPhoneNumberId}` : ''} ` +
        `but profiles.twilio_number doesn't reflect this — manual reconcile needed)`,
    }
  }

  return {
    ok: true,
    phoneNumber,
    reused: !!p.twilio_number,
    vapiAssistantId: assistantId,
    vapiImportFailed: !!vapiImportFailureMessage,
    vapiImportError: vapiImportFailureMessage ?? undefined,
  }
}
