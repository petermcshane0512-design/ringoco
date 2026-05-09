import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

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
  | { ok: true; phoneNumber: string; reused: boolean }
  | { ok: false; error: string }

/**
 * Idempotent number provisioning. Buys a local Twilio number near the
 * contractor's owner phone, configures voice + SMS webhooks, and saves
 * to profiles.twilio_number. If profile already has a number, returns it.
 */
export async function provisionNumberForUser(userId: string): Promise<ProvisionResult> {
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, twilio_number, owner_phone, business_name')
    .eq('user_id', userId)
    .maybeSingle()

  if (pErr || !profile) return { ok: false, error: 'profile not found' }
  if (profile.twilio_number) {
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

  const { error: uErr } = await supabase
    .from('profiles')
    .update({ twilio_number: purchased.phoneNumber, is_active: true })
    .eq('user_id', userId)

  if (uErr) {
    return { ok: false, error: `db update failed: ${uErr.message}` }
  }

  return { ok: true, phoneNumber: purchased.phoneNumber, reused: false }
}
