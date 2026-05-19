import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { attachNumberToMessagingService, A2P_MESSAGING_SERVICE_SID } from './a2p'
import { vapiImportTwilioNumber } from './vapi'

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
 * Idempotent number provisioning. Buys a local Twilio number near the
 * contractor's owner phone, configures voice + SMS webhooks, and saves
 * to profiles.twilio_number. If profile already has a number, returns it.
 */
export async function provisionNumberForUser(userId: string): Promise<ProvisionResult> {
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, twilio_number, owner_phone, business_name, vapi_phone_number_id, vapi_import_failed_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (pErr || !profile) return { ok: false, error: 'profile not found' }

  // Already has a Twilio number — but if the Vapi import previously failed
  // (vapi_phone_number_id null AND vapi_import_failed_at set), retry just the
  // Vapi step so the customer eventually gets the Cartesia/Claude flow they
  // paid for instead of being stuck on the legacy Polly route.
  if (profile.twilio_number) {
    const needsVapiRetry =
      !(profile as { vapi_phone_number_id?: string | null }).vapi_phone_number_id &&
      (profile as { vapi_import_failed_at?: string | null }).vapi_import_failed_at
    if (needsVapiRetry) {
      const retry = await retryVapiImport({
        userId,
        twilioPhoneNumber: profile.twilio_number,
        businessName: profile.business_name,
      })
      if (!retry.ok) {
        return { ok: false, error: `vapi import retry failed: ${retry.error}` }
      }
    }
    return { ok: true, phoneNumber: profile.twilio_number, reused: true }
  }

  const ownerAreaCode = extractAreaCode(profile.owner_phone)

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

  let purchased
  try {
    purchased = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber: candidates[0].phoneNumber,
      voiceUrl: `${APP_URL}/api/twilio/voice`,
      voiceMethod: 'POST',
      smsUrl: `${APP_URL}/api/twilio/sms`,
      smsMethod: 'POST',
      friendlyName: `BellAveGo · ${profile.business_name || profile.user_id}`,
    })
  } catch (e) {
    return { ok: false, error: `purchase failed: ${(e as Error).message}` }
  }

  const update: Record<string, string | boolean | null> = {
    twilio_number: purchased.phoneNumber,
    is_active: true,
  }

  // Attach to A2P 10DLC messaging service if configured. Non-fatal if it fails —
  // the number still works for voice + falls back to unregistered SMS.
  if (A2P_MESSAGING_SERVICE_SID) {
    const attach = await attachNumberToMessagingService(purchased.sid)
    if (attach.ok) {
      update.a2p_messaging_service_sid = A2P_MESSAGING_SERVICE_SID
      update.a2p_brand_status = 'approved'
    } else {
      console.warn(`A2P attach failed for ${purchased.phoneNumber}: ${attach.error}`)
    }
  }

  // Import into Vapi so the conversation layer runs through Cartesia/Claude/Deepgram
  // instead of the legacy Polly+Haiku route. Vapi overwrites the Twilio voiceUrl
  // to point at its SIP endpoint on import. SMS URL stays on /api/twilio/sms for
  // YES/NO handling.
  //
  // If the import fails, the customer's number works but answers via the legacy
  // Polly/Haiku route — they paid for Claude/Cartesia, so we surface this as a
  // provisioning failure (caught by the Stripe webhook + retry cron) and alert
  // Peter. We do NOT silently degrade to legacy.
  let vapiImportFailureMessage: string | null = null
  const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID
  if (VAPI_ASSISTANT_ID && process.env.VAPI_API_KEY) {
    try {
      const imp = await vapiImportTwilioNumber({
        twilioPhoneNumber: purchased.phoneNumber,
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID!,
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN!,
        assistantId: VAPI_ASSISTANT_ID,
        serverUrl: `${APP_URL}/api/vapi/assistant-request`,
        serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
        friendlyName: `BellAveGo · ${profile.business_name || profile.user_id}`,
      })
      update.vapi_phone_number_id = imp.id
      update.vapi_import_failed_at = null
      update.vapi_import_error = null
    } catch (e) {
      vapiImportFailureMessage = (e as Error).message
      console.error(
        `Vapi import failed for ${purchased.phoneNumber} — customer will hear legacy voice until retried:`,
        e,
      )
      update.vapi_import_failed_at = new Date().toISOString()
      update.vapi_import_error = vapiImportFailureMessage
    }
  } else {
    vapiImportFailureMessage = 'VAPI_ASSISTANT_ID or VAPI_API_KEY missing — Vapi import skipped'
    console.error(vapiImportFailureMessage)
    update.vapi_import_failed_at = new Date().toISOString()
    update.vapi_import_error = vapiImportFailureMessage
  }

  const { error: uErr } = await supabase
    .from('profiles')
    .update(update)
    .eq('user_id', userId)

  if (uErr) {
    return { ok: false, error: `db update failed: ${uErr.message}` }
  }

  return {
    ok: true,
    phoneNumber: purchased.phoneNumber,
    reused: false,
    vapiImportFailed: !!vapiImportFailureMessage,
    vapiImportError: vapiImportFailureMessage ?? undefined,
  }
}

/**
 * Re-runs just the Vapi import step for a profile that already has a Twilio
 * number but no vapi_phone_number_id. Called by provisionNumberForUser when a
 * retry comes in (via provision-retry cron or a fresh Stripe webhook fire on
 * an already-paid customer).
 */
async function retryVapiImport(opts: {
  userId: string
  twilioPhoneNumber: string
  businessName: string | null | undefined
}): Promise<{ ok: true; vapiPhoneNumberId: string } | { ok: false; error: string }> {
  const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID
  if (!VAPI_ASSISTANT_ID || !process.env.VAPI_API_KEY) {
    return { ok: false, error: 'VAPI_ASSISTANT_ID or VAPI_API_KEY missing' }
  }
  try {
    const imp = await vapiImportTwilioNumber({
      twilioPhoneNumber: opts.twilioPhoneNumber,
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID!,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN!,
      assistantId: VAPI_ASSISTANT_ID,
      serverUrl: `${APP_URL}/api/vapi/assistant-request`,
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      friendlyName: `BellAveGo · ${opts.businessName || opts.userId}`,
    })
    await supabase
      .from('profiles')
      .update({
        vapi_phone_number_id: imp.id,
        vapi_import_failed_at: null,
        vapi_import_error: null,
      })
      .eq('user_id', opts.userId)
    return { ok: true, vapiPhoneNumberId: imp.id }
  } catch (e) {
    const msg = (e as Error).message
    console.error(`retryVapiImport failed for ${opts.userId}:`, e)
    await supabase
      .from('profiles')
      .update({
        vapi_import_failed_at: new Date().toISOString(),
        vapi_import_error: msg,
      })
      .eq('user_id', opts.userId)
    return { ok: false, error: msg }
  }
}
