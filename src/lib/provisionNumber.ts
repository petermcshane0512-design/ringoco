import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { attachNumberToMessagingService, A2P_MESSAGING_SERVICE_SID } from './a2p'
import {
  vapiImportTwilioNumber,
  buildAssistantConfig,
  renderSystemPrompt,
  getAiNameForVoice,
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

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
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
  const business = tenant.businessName
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
    metadata: {
      user_id: profile.user_id,
      business_name: tenant.businessName,
      plan_tier: tenant.planTier ?? null,
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
      'user_id, twilio_number, owner_phone, owner_first_name, business_name, ' +
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
