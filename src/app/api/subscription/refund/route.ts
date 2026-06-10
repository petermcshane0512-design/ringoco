import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripeClient'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const PETER_PHONE = process.env.FALLBACK_OWNER_PHONE ?? '+17737109565'

// Structured cancel reasons â€” drives Peter's churn analysis.
const ALLOWED_REASONS = new Set([
  'voice_quality',
  'not_enough_calls',
  'too_expensive',
  'forwarding_broken',
  'wrong_fit',
  'found_alternative',
  'business_issue',
  'other',
])

/**
 * POST /api/subscription/refund
 *
 * Legacy route name (kept so existing dashboard / email links still work).
 * As of the 7-day-free-trial migration this route NO LONGER issues refunds.
 * The new model:
 *
 *   â€¢ Trial users (days 0-7, status='trialing') â†’ cancel immediately, NO
 *     charge ever fires. They get nothing to refund.
 *   â€¢ Paid users (status='active' post-trial) â†’ cancel_at_period_end. They
 *     keep service through the rest of their billing cycle, no refund.
 *
 * We do not run a money-back guarantee anymore. Hard cancels only.
 * Anyone asking for an exception gets routed to peter@bellavego.com.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { reason?: string; reasonDetail?: string }
  const reason = body.reason && ALLOWED_REASONS.has(body.reason) ? body.reason : 'unspecified'
  const reasonDetail = (body.reasonDetail ?? '').slice(0, 500)

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, stripe_subscription_id, stripe_customer_id, business_name, owner_phone, plan_tier')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile?.stripe_subscription_id || !profile.stripe_customer_id) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
  }

  let subscription: Stripe.Subscription
  try {
    subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
  } catch (e) {
    console.error('cancel: failed to retrieve subscription', e)
    return NextResponse.json({ error: 'Unable to retrieve subscription' }, { status: 500 })
  }

  const isTrialing = subscription.status === 'trialing'
  let serviceActiveUntil: string | null = null
  let cancellation: 'immediate' | 'period_end'

  try {
    if (isTrialing) {
      // Trial cancel â€” kill it now so no charge ever fires.
      cancellation = 'immediate'
      await stripe.subscriptions.cancel(profile.stripe_subscription_id, {
        invoice_now: false,
        prorate: false,
      })
      serviceActiveUntil = new Date().toISOString()
    } else {
      // Active paid subscription â€” cancel at period end. Customer keeps
      // service through the rest of the cycle they paid for. No refund.
      cancellation = 'period_end'
      const updated = (await stripe.subscriptions.update(profile.stripe_subscription_id, {
        cancel_at_period_end: true,
        metadata: { ...subscription.metadata, cancelled_at: new Date().toISOString() },
      })) as unknown as { current_period_end?: number; items: { data: Array<{ current_period_end?: number }> } }
      const periodEnd = updated.current_period_end || updated.items.data[0]?.current_period_end
      if (periodEnd) serviceActiveUntil = new Date(periodEnd * 1000).toISOString()
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('cancel failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  await supabase
    .from('profiles')
    .update({ plan_tier: 'cancelled' })
    .eq('user_id', userId)

  // SMS Peter every cancel â€” churn signal.
  const reasonLabel: Record<string, string> = {
    voice_quality:      "AI doesn't sound human enough",
    not_enough_calls:   "Not getting enough leads",
    too_expensive:      "Price not worth it",
    forwarding_broken:  "Couldn't get forwarding to work",
    wrong_fit:          "Not the right product fit",
    found_alternative:  "Switching to a competitor",
    business_issue:     "Business issue unrelated to product",
    other:              "Other",
    unspecified:        "(no reason given)",
  }
  try {
    const trialPart = isTrialing ? ' (during 7-day trial â€” no charge)' : ' (paid subscriber)'
    await twilioClient.messages.create({
      body:
        `âš ï¸ Cancel â€” ${profile.business_name ?? profile.user_id} (${profile.plan_tier ?? '?'})${trialPart}\n\n` +
        `ðŸ“Š Reason: ${reasonLabel[reason]}\n` +
        (reasonDetail ? `ðŸ’¬ Detail: "${reasonDetail}"\n` : '') +
        `\nMode: ${cancellation === 'immediate' ? 'immediate' : 'at period end'}\n` +
        `Service through: ${serviceActiveUntil ? new Date(serviceActiveUntil).toLocaleDateString() : '?'}\n\n` +
        `Reach out â€” recover or learn.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: PETER_PHONE,
    })
  } catch (e) {
    console.error('cancel SMS to Peter failed:', e)
  }

  const message = isTrialing
    ? 'Trial cancelled. No charge ever fired â€” your card was authorized but never billed.'
    : `Cancelled. Service stays live until ${serviceActiveUntil ? new Date(serviceActiveUntil).toLocaleDateString() : 'end of billing cycle'}. No refund is issued for the current cycle.`

  return NextResponse.json({
    ok: true,
    mode: cancellation,
    was_trialing: isTrialing,
    service_active_until: serviceActiveUntil,
    message,
  })
}
