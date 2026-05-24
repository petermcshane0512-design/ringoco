import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Read-only A2P 10DLC status check. Tells us:
 *   - Brand registration status (approved / pending / failed)
 *   - Campaign registration status
 *   - Messaging service health
 *   - Per-phone-number status: is each Twilio number attached to a
 *     messaging service + campaign?
 *
 * 30034 errors fire when ANY of: brand unapproved, campaign unapproved,
 * number not attached to a registered campaign. This endpoint shows
 * which one is wrong.
 *
 * Auth: requireAdmin().
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: 'Twilio creds missing' }, { status: 500 })
  }

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  const msgServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

  const out: Record<string, unknown> = {
    account_sid: process.env.TWILIO_ACCOUNT_SID.slice(0, 8) + '…',
    messaging_service_sid_env: msgServiceSid ?? '(not set)',
  }

  // List Trusthub brand + campaign registrations
  try {
    const brands = await client.messaging.v1.brandRegistrations.list({ limit: 10 })
    out.brands = brands.map((b) => ({
      sid: b.sid,
      brand_type: b.brandType,
      status: b.status,
      failure_reason: b.failureReason,
      date_updated: b.dateUpdated,
    }))
  } catch (e) {
    out.brands_error = (e as Error).message
  }

  // Messaging services
  try {
    const services = await client.messaging.v1.services.list({ limit: 10 })
    out.messaging_services = await Promise.all(
      services.map(async (s) => {
        let campaigns: unknown = '(skip)'
        let numbers: unknown = '(skip)'
        try {
          const c = await client.messaging.v1
            .services(s.sid)
            .usAppToPerson.list({ limit: 5 })
          campaigns = c.map((x) => ({
            sid: x.sid,
            campaign_status: x.campaignStatus,
            use_case: x.usAppToPersonUsecase,
            description: x.description?.slice(0, 80),
          }))
        } catch (e) {
          campaigns = `error: ${(e as Error).message}`
        }
        try {
          const n = await client.messaging.v1.services(s.sid).phoneNumbers.list({ limit: 25 })
          numbers = n.map((x) => x.phoneNumber)
        } catch (e) {
          numbers = `error: ${(e as Error).message}`
        }
        return {
          sid: s.sid,
          friendly_name: s.friendlyName,
          use_case: s.useCase,
          status_callback: s.statusCallback,
          numbers,
          campaigns,
        }
      }),
    )
  } catch (e) {
    out.messaging_services_error = (e as Error).message
  }

  // Twilio numbers on the account
  try {
    const nums = await client.incomingPhoneNumbers.list({ limit: 50 })
    out.account_numbers = nums.map((n) => ({
      phone: n.phoneNumber,
      friendly: n.friendlyName,
      sms_url: n.smsUrl,
      voice_url: n.voiceUrl,
    }))
  } catch (e) {
    out.account_numbers_error = (e as Error).message
  }

  // Verified Caller IDs (numbers you can SEND TO that bypass A2P during testing)
  try {
    const ids = await client.outgoingCallerIds.list({ limit: 20 })
    out.verified_caller_ids = ids.map((i) => ({ phone: i.phoneNumber, friendly_name: i.friendlyName }))
  } catch (e) {
    out.verified_caller_ids_error = (e as Error).message
  }

  return NextResponse.json(out)
}
