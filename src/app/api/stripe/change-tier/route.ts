import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import { isValidTier, priceFor, type Tier, type Interval } from '@/lib/pricing'

/**
 * In-app tier change for EXISTING subscribers.
 *
 * Use cases:
 *   - Upgrade Starter → Pro
 *   - Downgrade Pro → Starter
 *   - Switch monthly ↔ annual on same tier
 *
 * Differs from /api/stripe/checkout:
 *   - /checkout creates a NEW subscription (signup flow)
 *   - /change-tier UPDATES an existing subscription via subscriptions.update,
 *     which lets Stripe auto-prorate the difference. No new checkout window,
 *     no second credit card prompt — the change applies instantly.
 *
 * Stripe behavior:
 *   - Upgrade: customer charged the prorated difference today, new price
 *     starts immediately, next invoice is the full new amount.
 *   - Downgrade: customer credited the unused portion, new price applies
 *     at next billing cycle (proration_behavior='create_prorations' default).
 *
 * Auth: Clerk session. Can only change YOUR OWN subscription.
 * Concierge tier changes are accepted normally — Elite went live 2026-05-27 (handled in /checkout
 * already; mirror here for defense in depth).
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    tier?: string
    interval?: Interval
  }
  if (!isValidTier(body.tier ?? '')) {
    return NextResponse.json({ error: 'invalid tier' }, { status: 400 })
  }
  const newTier = body.tier as Tier
  const newInterval: Interval = body.interval === 'annual' ? 'annual' : 'monthly'

  // Elite (concierge) went live 2026-05-27. Tier change to Elite goes
  // through the normal Stripe subscription update path below — no waitlist
  // detour. White-glove FSM integration kicks off post-checkout via the
  // onboarding workflow (founder-led).

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id, plan_tier')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile?.stripe_customer_id) {
    // No Stripe customer yet — they need to go through normal checkout
    // (signup flow). Tell the caller to redirect to /api/stripe/checkout.
    return NextResponse.json(
      {
        error: 'No billing account — start a fresh checkout instead.',
        redirect_to_checkout: true,
      },
      { status: 400 },
    )
  }

  if (!profile.stripe_subscription_id) {
    return NextResponse.json(
      {
        error: 'No active subscription found. Start a new checkout to subscribe.',
        redirect_to_checkout: true,
      },
      { status: 400 },
    )
  }

  const newPriceId = priceFor(newTier, newInterval)
  if (!newPriceId) {
    return NextResponse.json({ error: 'price not configured for that tier/interval' }, { status: 400 })
  }

  try {
    // Pull current subscription so we know the existing subscription item ID
    // (Stripe requires us to identify which item to update; for our setup
    // there's exactly one subscription item per subscription).
    const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
    const currentItem = sub.items.data[0]
    if (!currentItem) {
      return NextResponse.json({ error: 'subscription has no items — contact support' }, { status: 500 })
    }

    // If they're already on this exact price, nothing to do.
    if (currentItem.price.id === newPriceId) {
      return NextResponse.json({
        ok: true,
        already_on_plan: true,
        message: `You're already on ${newTier} (${newInterval}).`,
      })
    }

    // Apply the change with proration. Stripe auto-handles credit/debit on
    // next invoice. proration_behavior='create_prorations' is the default
    // and is what makes upgrades charge immediately + downgrades credit.
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{ id: currentItem.id, price: newPriceId }],
      proration_behavior: 'create_prorations',
      metadata: { userId, tier: newTier, interval: newInterval, changed_via: 'in_app' },
    })

    // Update profiles.plan_tier IMMEDIATELY so the dashboard reflects the new
    // tier without waiting for the Stripe webhook to round-trip (~1-5 sec).
    // The webhook will also fire and write the same value — harmless idempotent.
    await supabase
      .from('profiles')
      .update({ plan_tier: newTier })
      .eq('user_id', userId)

    return NextResponse.json({
      ok: true,
      tier: newTier,
      interval: newInterval,
      message: `You're now on ${newTier} (${newInterval}). Proration applied automatically.`,
    })
  } catch (e) {
    const err = e as { message?: string; code?: string; type?: string }
    console.error('[change-tier] Stripe error:', { userId, newTier, newInterval, err })
    return NextResponse.json(
      { error: err.message || 'Stripe update failed', code: err.code, type: err.type },
      { status: 500 },
    )
  }
}
