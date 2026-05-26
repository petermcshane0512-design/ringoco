import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'
import { type Tier, type Interval, priceFor, isValidTier } from '@/lib/pricing'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://www.bellavego.com'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    tier?: string
    interval?: Interval
  }
  const tier: Tier = isValidTier(body.tier ?? '') ? (body.tier as Tier) : 'officemgr'
  const interval: Interval = body.interval === 'annual' ? 'annual' : 'monthly'

  // ── Concierge & Multi-Location are deferred until Q3 2026 ──
  // Defensive guard: even if someone POSTs with tier=concierge directly,
  // we refuse the Stripe charge and redirect them to the waitlist instead.
  // Pricing page / dashboard activation banner should be redirecting the
  // BUTTON to /waitlist before this fires, but this is the belt-and-suspenders
  // server-side block.
  if (tier === 'concierge') {
    return NextResponse.json(
      {
        waitlist: true,
        redirect: '/waitlist?tier=concierge',
        message:
          'Concierge launches Q3 2026 — limited spots reserved for waitlist members at early-access pricing. ' +
          'Visit /waitlist?tier=concierge to claim a spot.',
      },
      { status: 200 },
    )
  }

  // Founding-partner pricing: subscription only — setup fee waived for the
  // first batch of customers. Re-add `{ price: setupPriceFor(tier), quantity: 1 }`
  // to line_items + re-import setupPriceFor once setup fees are turned back on.
  const subPriceId = priceFor(tier, interval)

  const line_items: { price: string; quantity: number }[] = [
    { price: subPriceId, quantity: 1 },
  ]

  try {
    // ── 7-DAY FREE TRIAL (replaces the legacy 30-day money-back guarantee) ──
    // Stripe behavior:
    //   * Card is collected at checkout (Stripe requires payment_method even on
    //     trials in subscription mode by default — we pin that explicitly with
    //     payment_method_collection:'always' so test/no-card paths can't slip
    //     through).
    //   * First $0 invoice is generated immediately, marked paid.
    //   * On day 8 the trial ends and Stripe automatically issues the first
    //     real invoice + charges the card. customer.subscription.trial_will_end
    //     fires at trial_end - 72h so we can warn the contractor by SMS/email.
    //   * If the customer cancels (cancel_at_period_end via the portal or our
    //     /api/subscription/refund route) before day 8, the trial ends and no
    //     charge ever fires.
    // Never widen TRIAL_DAYS without re-checking Stripe's free-trial fraud
    // limits (>14 days requires bank-grade KYC for new merchants).
    const TRIAL_DAYS = 7
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items,
      payment_method_collection: 'always',
      metadata: { userId, tier, interval, trial_days: String(TRIAL_DAYS) },
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        trial_settings: {
          end_behavior: { missing_payment_method: 'cancel' },
        },
        metadata: { userId, tier, interval, trial_days: String(TRIAL_DAYS) },
      },
      success_url: `${APP_URL}/dashboard/setup?welcome=1&trial=1`,
      cancel_url: `${APP_URL}`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    // Surface the actual Stripe error so we can debug instead of guessing
    const errObj = err as { message?: string; code?: string; type?: string; raw?: { message?: string } }
    const detail = errObj.raw?.message || errObj.message || String(err)
    console.error('[checkout] Stripe error:', { tier, interval, subPriceId, detail, type: errObj.type, code: errObj.code })
    return NextResponse.json(
      { error: detail, code: errObj.code, type: errObj.type, tier, interval },
      { status: 500 },
    )
  }
}