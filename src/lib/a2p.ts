import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * A2P 10DLC registration helpers.
 *
 * Background: US carriers require business SMS to be registered (brand + campaign)
 * or messages get filtered. At BellAveGo scale (1 number per customer) we use the
 * "ISV / Reseller" model: ONE BellAveGo brand, ONE shared Standard A2P campaign,
 * all customer numbers join that campaign via a shared Messaging Service.
 *
 * What this file gives you:
 *   - createMessagingService(): one-time setup, creates the BellAveGo MS
 *   - attachNumberToMessagingService(number): called from provisionNumber
 *   - syncExistingNumbersToCampaign(): one-shot retro for already-provisioned numbers
 *
 * What it CANNOT do automatically (you must do once in Twilio Console):
 *   1. Create the Customer Profile (Trust Hub → Customer Profiles → New)
 *      — needs EIN, business name, address, website, contact email
 *   2. Create the A2P Brand Registration (Trust Hub → Brand Registrations)
 *      — references the Customer Profile, costs ~$4 one-time
 *   3. Create the A2P Messaging Campaign (Trust Hub → Messaging Campaigns)
 *      — references the Brand. Use case: "Mixed" or "Customer Care".
 *      — costs ~$10 vetting + $1.50/mo
 *   4. Paste the resulting Messaging Service SID into env: TWILIO_MESSAGING_SERVICE_SID
 *
 * After that, this file fully automates per-customer number enrollment.
 */

export const A2P_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID

/**
 * One-time bootstrap. Creates the shared BellAveGo Messaging Service that all
 * customer numbers will live inside. Idempotent on the friendly name.
 * Returns the MS SID — paste this into TWILIO_MESSAGING_SERVICE_SID env var.
 */
export async function ensureMessagingService(opts: {
  friendlyName?: string
  inboundRequestUrl?: string
  fallbackUrl?: string
}): Promise<{ ok: true; sid: string; reused: boolean } | { ok: false; error: string }> {
  const friendlyName = opts.friendlyName || 'BellAveGo Platform'
  try {
    // Look for an existing one
    const existing = await twilioClient.messaging.v1.services.list({ limit: 50 })
    const found = existing.find((s) => s.friendlyName === friendlyName)
    if (found) return { ok: true, sid: found.sid, reused: true }

    const created = await twilioClient.messaging.v1.services.create({
      friendlyName,
      // Mirror per-number webhook so the SMS approval YES/NO flow still works
      inboundRequestUrl: opts.inboundRequestUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.bellavego.com'}/api/twilio/sms`,
      fallbackUrl: opts.fallbackUrl,
      useInboundWebhookOnNumber: false,
      stickySender: true,
      // Lets the platform absorb a stuck number without losing the campaign
      scanMessageContent: 'inherit',
    })
    return { ok: true, sid: created.sid, reused: false }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Attach an already-provisioned Twilio number to the BellAveGo Messaging Service
 * (which is bound to the approved A2P campaign). After this, SMS from that
 * number is sent under the registered 10DLC brand + campaign.
 *
 * Safe to call on every new provisioning. Idempotent.
 */
export async function attachNumberToMessagingService(
  phoneNumberSid: string,
): Promise<{ ok: true; reused?: boolean } | { ok: false; error: string }> {
  if (!A2P_MESSAGING_SERVICE_SID) {
    return { ok: false, error: 'TWILIO_MESSAGING_SERVICE_SID not set — finish A2P setup in Twilio Console first' }
  }
  try {
    // Already in the service? Twilio returns 409.
    await twilioClient.messaging.v1
      .services(A2P_MESSAGING_SERVICE_SID)
      .phoneNumbers.create({ phoneNumberSid })
    return { ok: true }
  } catch (e) {
    const msg = (e as { message?: string; status?: number }).message || ''
    if (/already exists|409/i.test(msg)) return { ok: true, reused: true }
    return { ok: false, error: msg || 'attach failed' }
  }
}

/**
 * One-shot retro. Walk every active customer with a twilio_number, fetch its SID,
 * attach to the BellAveGo Messaging Service. Stamp profiles.a2p_messaging_service_sid
 * so we don't re-attach next run.
 */
export async function syncExistingNumbersToCampaign(): Promise<{
  processed: number
  attached: number
  errors: number
  details: { user_id: string; status: 'attached' | 'cached' | 'error'; reason?: string }[]
}> {
  if (!A2P_MESSAGING_SERVICE_SID) {
    return { processed: 0, attached: 0, errors: 1, details: [{ user_id: '*', status: 'error', reason: 'TWILIO_MESSAGING_SERVICE_SID not set' }] }
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, twilio_number, a2p_messaging_service_sid')
    .eq('is_active', true)
    .not('twilio_number', 'is', null)
    .limit(1000)

  const details: { user_id: string; status: 'attached' | 'cached' | 'error'; reason?: string }[] = []
  let attached = 0
  let errors = 0

  for (const p of profiles ?? []) {
    if (p.a2p_messaging_service_sid === A2P_MESSAGING_SERVICE_SID) {
      details.push({ user_id: p.user_id, status: 'cached' })
      continue
    }
    try {
      // Find the IncomingPhoneNumber SID for this number
      const matches = await twilioClient.incomingPhoneNumbers.list({
        phoneNumber: p.twilio_number!,
        limit: 1,
      })
      const target = matches[0]
      if (!target) {
        errors++
        details.push({ user_id: p.user_id, status: 'error', reason: 'number not found in Twilio account' })
        continue
      }
      const res = await attachNumberToMessagingService(target.sid)
      if (!res.ok) {
        errors++
        details.push({ user_id: p.user_id, status: 'error', reason: res.error })
        continue
      }
      await supabase
        .from('profiles')
        .update({ a2p_messaging_service_sid: A2P_MESSAGING_SERVICE_SID })
        .eq('user_id', p.user_id)
      attached++
      details.push({ user_id: p.user_id, status: 'attached' })
    } catch (e) {
      errors++
      details.push({ user_id: p.user_id, status: 'error', reason: (e as Error).message })
    }
  }

  return { processed: profiles?.length ?? 0, attached, errors, details }
}
