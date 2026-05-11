import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://www.bellavego.com'

type Tier = 'receptionist' | 'officemgr' | 'concierge'
type Interval = 'monthly' | 'annual'

function priceFor(tier: Tier, interval: Interval): string | undefined {
  const map: Record<Tier, Record<Interval, string | undefined>> = {
    receptionist: {
      monthly: process.env.STRIPE_PRICE_RECEPTIONIST_MONTHLY,
      annual: process.env.STRIPE_PRICE_RECEPTIONIST_ANNUAL,
    },
    officemgr: {
      monthly: process.env.STRIPE_PRICE_OFFICEMGR_MONTHLY,
      annual: process.env.STRIPE_PRICE_OFFICEMGR_ANNUAL,
    },
    concierge: {
      monthly: process.env.STRIPE_PRICE_CONCIERGE_MONTHLY,
      annual: process.env.STRIPE_PRICE_CONCIERGE_ANNUAL,
    },
  }
  return map[tier]?.[interval]
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    tier?: Tier
    interval?: Interval
  }
  const tier: Tier = body.tier ?? 'officemgr'  // AI Office Manager is the flagship/default
  const interval: Interval = body.interval ?? 'monthly'

  // NO fallback to STRIPE_PRICE_ID — that historically pointed at a legacy $97 price
  // and silently charged the wrong amount when priceFor() returned empty.
  // Fail loudly instead.
  const subPriceId = priceFor(tier, interval)
  if (!subPriceId) {
    console.error(`[checkout] No price configured for tier=${tier} interval=${interval}. ` +
      `Env present: RECEPTIONIST_MONTHLY=${!!process.env.STRIPE_PRICE_RECEPTIONIST_MONTHLY} ` +
      `OFFICEMGR_MONTHLY=${!!process.env.STRIPE_PRICE_OFFICEMGR_MONTHLY} ` +
      `CONCIERGE_MONTHLY=${!!process.env.STRIPE_PRICE_CONCIERGE_MONTHLY}`)
    return NextResponse.json(
      { error: `Price not configured for ${tier}/${interval}. Contact support — peter@bellavego.com.` },
      { status: 500 },
    )
  }

  // v6 pricing (May 10 2026): Setup fee on every tier ($50 / $247 / $497).
  // 30-day money-back guarantee on subscription only (setup non-refundable — covers
  // real onboarding work: number provisioning, A2P registration, prompt tuning, integrations).
  // No more free trial — paid customers convert and stay; trial farmers cost real Twilio + Claude $.
  const setupPrice =
    tier === 'receptionist' ? process.env.STRIPE_PRICE_RECEPTIONIST_SETUP :
    tier === 'officemgr'    ? process.env.STRIPE_PRICE_OFFICEMGR_SETUP :
    tier === 'concierge'    ? process.env.STRIPE_PRICE_CONCIERGE_SETUP :
    undefined

  const line_items: { price: string; quantity: number }[] = [{ price: subPriceId, quantity: 1 }]
  if (setupPrice) line_items.push({ price: setupPrice, quantity: 1 })

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items,
      metadata: { userId, tier, interval },
      subscription_data: { metadata: { userId, tier, interval } },
      success_url: `${APP_URL}/dashboard/setup?welcome=1`,
      cancel_url: `${APP_URL}`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('checkout error:', err)
    return NextResponse.json({ error: 'Stripe error' }, { status: 500 })
  }
}