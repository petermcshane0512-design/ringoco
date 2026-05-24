import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Read-only — current Twilio account balance + last 30 days of charges
 * + full A2P brand registration details (so we can see exactly what
 * info was submitted: LLC name, business type, sole-prop vs LLC, etc.).
 * Auth: requireAdmin().
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: 'Twilio creds missing' }, { status: 500 })
  }
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

  const out: Record<string, unknown> = {}

  // Account balance
  try {
    const bal = await client.balance.fetch()
    out.balance = {
      balance: bal.balance,
      currency: bal.currency,
    }
  } catch (e) {
    out.balance_error = (e as Error).message
  }

  // Account details (status, type — pay-as-you-go vs trial)
  try {
    const acct = await client.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID).fetch()
    out.account = {
      sid: acct.sid,
      friendly_name: acct.friendlyName,
      status: acct.status,
      type: acct.type,
      date_created: acct.dateCreated,
    }
  } catch (e) {
    out.account_error = (e as Error).message
  }

  // Brand registration details — what's actually registered with TCR
  try {
    const brands = await client.messaging.v1.brandRegistrations.list({ limit: 5 })
    out.brands = await Promise.all(
      brands.map(async (b) => {
        let customerProfile: unknown = null
        if (b.customerProfileBundleSid) {
          try {
            const cp = await client.trusthub.v1
              .customerProfiles(b.customerProfileBundleSid)
              .fetch()
            customerProfile = {
              sid: cp.sid,
              friendly_name: cp.friendlyName,
              status: cp.status,
              email: cp.email,
              policy_sid: cp.policySid,
            }
          } catch (e) {
            customerProfile = { error: (e as Error).message }
          }
        }
        return {
          sid: b.sid,
          brand_type: b.brandType,
          status: b.status,
          failure_reason: b.failureReason,
          customer_profile_bundle_sid: b.customerProfileBundleSid,
          a2p_profile_bundle_sid: b.a2pProfileBundleSid,
          brand_score: b.brandScore,
          tcr_id: b.tcrId,
          identity_status: b.identityStatus,
          russell_3000: b.russell3000,
          tax_exempt_status: b.taxExemptStatus,
          date_created: b.dateCreated,
          date_updated: b.dateUpdated,
          customer_profile: customerProfile,
        }
      }),
    )
  } catch (e) {
    out.brands_error = (e as Error).message
  }

  // Recent usage charges (last 30 days summary)
  try {
    const usage = await client.usage.records.list({
      category: 'a2p-registration-fees' as never,
      limit: 10,
    })
    out.a2p_fee_records = usage.map((u) => ({
      category: u.category,
      description: u.description,
      usage: u.usage,
      price: u.price,
      start_date: u.startDate,
      end_date: u.endDate,
    }))
  } catch (e) {
    out.a2p_fee_records_error = (e as Error).message
  }

  return NextResponse.json(out)
}
