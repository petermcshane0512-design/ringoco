import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripeClient'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { deprovisionForUser } from '@/lib/provisionNumber'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)

const PETER_PHONE = process.env.FALLBACK_OWNER_PHONE ?? '+17737109565'

/**
 * POST /api/account/delete
 *
 * Permanent account erasure. Executes in this order, and continues past
 * non-fatal failures so a partial deletion never leaves a customer
 * trapped with an active sub but no Clerk login (legal exposure):
 *
 *   1. Cancel any Stripe subscription IMMEDIATELY (active or trialing) â€”
 *      ensures no further charges fire after deletion regardless of
 *      whether downstream steps succeed.
 *   2. Release Twilio number + delete Vapi assistant via deprovisionForUser.
 *   3. Delete child rows from Supabase (jobs, customers, call_logs,
 *      push_subscriptions, etc.) then the profiles row.
 *   4. Delete the Clerk user â€” only after the above so a retry can still
 *      auth and resume cleanup if a middle step throws.
 *
 * Re-signup with the same email is allowed by Clerk natively after the
 * user is deleted. Account starts clean â€” new Twilio number, fresh
 * profile. Communicated to the user in the post-delete UI.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    confirmation?: string
    reason?: string
  }
  // Hard gate â€” UI must send the literal text DELETE so accidental
  // double-clicks or autoplay scripts can't nuke a real account.
  if (body.confirmation !== 'DELETE') {
    return NextResponse.json(
      { error: 'Missing confirmation. Type DELETE to confirm.' },
      { status: 400 },
    )
  }

  const errors: string[] = []
  let businessName: string | null = null
  let stripeSubId: string | null = null

  // Snapshot profile FIRST so we have a name for the Peter SMS even if
  // the row is gone by the time we send it.
  try {
    const { data } = await supabase
      .from('profiles')
      .select('business_name, stripe_subscription_id, owner_phone')
      .eq('user_id', userId)
      .maybeSingle()
    const p = data as {
      business_name?: string | null
      stripe_subscription_id?: string | null
      owner_phone?: string | null
    } | null
    businessName = p?.business_name ?? null
    stripeSubId = p?.stripe_subscription_id ?? null
  } catch (e) {
    errors.push(`profile snapshot: ${(e as Error).message}`)
  }

  // STEP 1 â€” Stripe cancel IMMEDIATELY (not period-end). Permanent
  // deletion implies "stop charging me right now."
  if (stripeSubId) {
    try {
      await stripe.subscriptions.cancel(stripeSubId, {
        invoice_now: false,
        prorate: false,
      })
    } catch (e) {
      // If it's already cancelled we get a Stripe error â€” non-fatal.
      const msg = (e as { message?: string }).message ?? String(e)
      if (!/no such|already canceled/i.test(msg)) {
        errors.push(`stripe cancel: ${msg}`)
      }
    }
  }

  // STEP 2 â€” release Twilio + delete Vapi assistant.
  try {
    const result = await deprovisionForUser(userId)
    if (!result.ok) {
      errors.push(`deprovision: ${result.errors.join('; ')}`)
    }
  } catch (e) {
    errors.push(`deprovision threw: ${(e as Error).message}`)
  }

  // STEP 3 â€” purge Supabase rows. Order matters: children first, parent
  // last. Foreign keys ON DELETE CASCADE handle most of this but we do
  // explicit deletes so a missing constraint doesn't strand rows.
  const childTables = [
    'jobs',
    'customers',
    'call_logs',
    'push_subscriptions',
    'outreach_calls',
    'usage_events',
    'consulting_reports',
    'invoices',
  ]
  for (const table of childTables) {
    try {
      await supabase.from(table).delete().eq('user_id', userId)
    } catch (e) {
      // Non-fatal â€” table may not exist on this branch or row may have
      // no user_id column. Log + continue.
      errors.push(`${table} purge: ${(e as Error).message}`)
    }
  }
  try {
    await supabase.from('profiles').delete().eq('user_id', userId)
  } catch (e) {
    errors.push(`profiles delete: ${(e as Error).message}`)
  }

  // STEP 4 â€” delete Clerk user LAST so a partial-failure retry still
  // authenticates and can finish cleanup.
  try {
    const client = await clerkClient()
    await client.users.deleteUser(userId)
  } catch (e) {
    errors.push(`clerk delete: ${(e as Error).message}`)
  }

  // Notify Peter â€” every deletion is a churn signal worth knowing about
  // even more than a cancel (this customer doesn't just want to pause,
  // they want to be erased).
  try {
    const reason = (body.reason ?? '(no reason given)').slice(0, 240)
    await twilioClient.messages.create({
      body:
        `ðŸ—‘ï¸ Account DELETED â€” ${businessName ?? userId}\n\n` +
        `Reason: ${reason}\n\n` +
        (errors.length > 0 ? `âš ï¸ Partial errors:\n${errors.slice(0, 3).join('\n')}\n` : 'Clean deletion.\n') +
        `\nUser can re-sign-up with same email anytime.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: PETER_PHONE,
    })
  } catch (e) {
    console.error('delete-account SMS to Peter failed:', e)
  }

  return NextResponse.json({
    ok: true,
    errors,
    message:
      "Your account is permanently deleted. Your subscription is cancelled and your AI receptionist number has been released. You can sign up again anytime with the same email â€” you'll get a fresh AI receptionist number.",
  })
}
