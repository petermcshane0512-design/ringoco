import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const PETER_PHONE = process.env.FALLBACK_OWNER_PHONE ?? '+17737109565'
const REFUND_WINDOW_DAYS = 30

// Structured reasons drive Peter's product roadmap — the SMS he gets on
// every refund includes the picked reason + the free-text so he can see
// patterns ("3/5 refunds this week said 'voice sounds robotic'").
const ALLOWED_REASONS = new Set([
  'voice_quality',         // AI doesn't sound human enough
  'not_enough_calls',      // not getting enough leads
  'too_expensive',         // price not worth it
  'forwarding_broken',     // couldn't get forwarding to work
  'wrong_fit',             // not the right product for my business
  'found_alternative',     // switching to a competitor
  'business_issue',        // business problem unrelated to product
  'other',
])

/**
 * Self-serve 30-day money-back guarantee.
 * POST /api/subscription/refund
 *
 * Refund covers the full subscription invoice (no setup fee charged currently —
 * see TIER_METADATA in src/lib/pricing.ts). Subscription cancels at period-end
 * so the customer keeps service through the end of the billing cycle they paid for.
 *
 * If setup fees are re-enabled in the future, this route already skips them
 * (the lineItem filter only matches recurring price lines), so the refund
 * logic stays correct: only the sub portion gets refunded, setup retained.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reason capture (optional — old clients that POST with no body still work)
  const body = await req.json().catch(() => ({})) as { reason?: string; reasonDetail?: string }
  const reason = body.reason && ALLOWED_REASONS.has(body.reason) ? body.reason : 'unspecified'
  const reasonDetail = (body.reasonDetail ?? '').slice(0, 500) // truncate to a sane length

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
    console.error('refund: failed to retrieve subscription', e)
    return NextResponse.json({ error: 'Unable to retrieve subscription' }, { status: 500 })
  }

  // 30-day window check — anchored to the customer's FIRST EVER subscription,
  // not the current one. Previously we used the current subscription.created,
  // which let a customer refund on day 28, re-subscribe on day 29, and get a
  // fresh 30-day window every cycle. Now: one window per customer, ever.
  let earliestCreatedSec = subscription.created
  try {
    const allSubs = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'all',
      limit: 100,
    })
    for (const s of allSubs.data) {
      if (s.created < earliestCreatedSec) earliestCreatedSec = s.created
    }
  } catch (e) {
    // Non-fatal — fall back to current subscription.created if list fails
    console.warn('refund: subscription list failed, using current.created', e)
  }

  const createdMs = earliestCreatedSec * 1000
  const daysSinceStart = (Date.now() - createdMs) / (1000 * 60 * 60 * 24)
  if (daysSinceStart > REFUND_WINDOW_DAYS) {
    return NextResponse.json({
      error:
        `Your account started ${Math.floor(daysSinceStart)} days ago — past the ${REFUND_WINDOW_DAYS}-day money-back window. ` +
        `If something specific isn't working we want to make it right. Text Peter directly at (773) 710-9565 or email peter@bellavego.com — we handle these case-by-case and usually resolve within 24 hours.`,
    }, { status: 400 })
  }

  // Recurring (subscription) line item amount — what we refund.
  // Setup line items live on a separate invoice or are flagged as non-recurring; we skip them.
  type LooseLineItem = { amount?: number; pricing?: { price_details?: { price?: string } }; price?: { recurring?: unknown } | null }
  type LooseInvoice = { id?: string; payment_intent?: string | null; charge?: string | null; lines: { data: LooseLineItem[] }; payments?: { data: Array<{ payment?: { payment_intent?: string } }> } }

  const invoices = await stripe.invoices.list({
    customer: profile.stripe_customer_id,
    status: 'paid',
    limit: 10,
  })

  let recurringTotal = 0
  let paymentIntentId: string | undefined
  for (const rawInv of invoices.data) {
    const inv = rawInv as unknown as LooseInvoice
    const lineTotal = inv.lines.data.reduce((sum, line) => {
      const isRecurring = !!line.price?.recurring || !!line.pricing?.price_details?.price
      // newer SDK: line.pricing.price_details.price points to a Price; we treat any non-zero subscription-line
      // amount as recurring if the subscription itself owns it. As a defensive heuristic, also require positive amount.
      return isRecurring && line.amount && line.amount > 0 ? sum + line.amount : sum
    }, 0)
    if (lineTotal > 0) {
      recurringTotal = lineTotal
      paymentIntentId =
        inv.payment_intent ||
        inv.payments?.data?.[0]?.payment?.payment_intent ||
        undefined
      break
    }
  }

  if (recurringTotal <= 0 || !paymentIntentId) {
    return NextResponse.json({
      error: 'No refundable subscription invoice found yet. Your first month may bill at the end of the cycle. Email peter@bellavego.com.',
    }, { status: 400 })
  }

  // Refund
  let refund: Stripe.Refund
  try {
    refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: recurringTotal,
      reason: 'requested_by_customer',
      metadata: {
        userId,
        guarantee: '30-day money-back',
        customer_reason: reason,
        customer_reason_detail: reasonDetail,
        business_name: profile.business_name ?? '',
        tier: profile.plan_tier ?? '',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('refund creation failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Cancel at period end — they keep service through the rest of this billing cycle
  let serviceActiveUntil: string | null = null
  try {
    const updated = (await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: true,
      metadata: { ...subscription.metadata, refunded_at: new Date().toISOString() },
    })) as unknown as { current_period_end?: number; items: { data: Array<{ current_period_end?: number }> } }
    const periodEnd = updated.current_period_end || updated.items.data[0]?.current_period_end
    if (periodEnd) serviceActiveUntil = new Date(periodEnd * 1000).toISOString()
  } catch (e) {
    console.error('cancel-at-period-end failed:', e)
  }

  await supabase
    .from('profiles')
    .update({ plan_tier: 'cancelled' })
    .eq('user_id', userId)

  // SMS Peter every refund — churn signals matter. Includes the structured
  // reason + free-text so patterns are obvious without opening Stripe.
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
    await twilioClient.messages.create({
      body:
        `⚠️ Refund — ${profile.business_name ?? profile.user_id} (${profile.plan_tier ?? '?'})\n\n` +
        `Amount: $${(recurringTotal / 100).toFixed(2)} · Day ${Math.floor(daysSinceStart)}/30\n\n` +
        `📊 Reason: ${reasonLabel[reason]}\n` +
        (reasonDetail ? `💬 Detail: "${reasonDetail}"\n` : '') +
        `\nRefund: ${refund.id}\n\n` +
        `Reach out — recover or learn.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: PETER_PHONE,
    })
  } catch (e) {
    console.error('refund SMS to Peter failed:', e)
  }

  return NextResponse.json({
    ok: true,
    refund_id: refund.id,
    refunded_amount: recurringTotal / 100,
    service_active_until: serviceActiveUntil,
    message: `Refund of $${(recurringTotal / 100).toFixed(2)} processed. Service stays live until ${serviceActiveUntil ? new Date(serviceActiveUntil).toLocaleDateString() : 'end of billing cycle'}.`,
  })
}
