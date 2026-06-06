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
    creatorCode?: string  // BAVG-XXXXXX from /r/[code] cookie redemption
  }
  const tier: Tier = isValidTier(body.tier ?? '') ? (body.tier as Tier) : 'officemgr'
  const interval: Interval = body.interval === 'annual' ? 'annual' : 'monthly'
  // 2026-06-06 PIVOT — trial only via creator code. Public path = pay-immediately.
  // BAVG-XXXXXX format validated; anything else ignored.
  const rawCode = (body.creatorCode || '').trim().toUpperCase()
  const creatorCode = /^BAVG-[A-Z0-9]{6}$/.test(rawCode) ? rawCode : null
  // Also read attribution cookie set by /r/[code] visit (in case JS path missed it).
  const cookieCode = req.cookies.get('bavg_creator_code')?.value || ''
  const effectiveCode = creatorCode || (/^BAVG-[A-Z0-9]{6}$/.test(cookieCode.toUpperCase()) ? cookieCode.toUpperCase() : null)

  // ── Elite (concierge) is LIVE as of 2026-05-27 ──
  // Previously waitlist-gated until 3 Pro customers existed. Lifted because
  // (a) the Elite delivery stack is real (marketing-ops cron + competitor
  // watcher + permit scanner + regulatory watch + ad gen + local SEO all
  // shipped) and (b) the white-glove FSM integration promise is delivered
  // founder-led during onboarding, no extra infra needed.
  // Multi-location is still founder-led (handled outside Stripe).

  // Founding-partner pricing: subscription only — setup fee waived for the
  // first batch of customers. Re-add `{ price: setupPriceFor(tier), quantity: 1 }`
  // to line_items + re-import setupPriceFor once setup fees are turned back on.
  const subPriceId = priceFor(tier, interval)

  const line_items: { price: string; quantity: number }[] = [
    { price: subPriceId, quantity: 1 },
  ]

  try {
    // ── TRIAL POLICY 2026-06-06 PIVOT ──
    // - With valid creator code (BAVG-XXXXXX) → 14-day trial. Filters tire-kickers
    //   via card-on-file but gives real evaluation window per Hormozi spec.
    // - Without code → 0-day trial (pay immediately). Public-trial path killed;
    //   forces signups through creator channel for attribution + commission.
    const TRIAL_DAYS = effectiveCode ? 14 : 0
    const subscriptionData: Record<string, unknown> = {
      metadata: {
        userId,
        tier,
        interval,
        trial_days: String(TRIAL_DAYS),
        creator_code: effectiveCode || '',
      },
    }
    if (TRIAL_DAYS > 0) {
      subscriptionData.trial_period_days = TRIAL_DAYS
      subscriptionData.trial_settings = {
        end_behavior: { missing_payment_method: 'cancel' },
      }
    }
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items,
      allow_promotion_codes: true,
      payment_method_collection: 'always',
      metadata: {
        userId,
        tier,
        interval,
        trial_days: String(TRIAL_DAYS),
        creator_code: effectiveCode || '',
      },
      subscription_data: subscriptionData as never,
      // Risk-reversal banner shown above the Subscribe button on Stripe
      // Checkout. terms_of_service_acceptance.message intentionally omitted —
      // it requires consent_collection.terms_of_service: 'required' to be
      // set, which adds a forced TOS checkbox that hurts conversion.
      custom_text: {
        submit: {
          message: '30-day money-back guarantee. If BellAveGo does not earn you back your subscription cost in 30 days, click cancel in your dashboard and we refund every penny — no questions, no calls, no hoops.',
        },
      },
      success_url: `${APP_URL}/dashboard/setup?welcome=1${TRIAL_DAYS > 0 ? '&trial=1' : ''}`,
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