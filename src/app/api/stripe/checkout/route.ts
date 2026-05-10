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

type Tier = 'foundation' | 'growth'
type Interval = 'monthly' | 'annual'

function priceFor(tier: Tier, interval: Interval): string | undefined {
  const map: Record<Tier, Record<Interval, string | undefined>> = {
    foundation: {
      monthly: process.env.STRIPE_PRICE_FOUNDATION_MONTHLY,
      annual: process.env.STRIPE_PRICE_FOUNDATION_ANNUAL,
    },
    growth: {
      monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
      annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
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
  const tier: Tier = body.tier ?? 'growth'
  const interval: Interval = body.interval ?? 'monthly'

  const subPriceId = priceFor(tier, interval) ?? process.env.STRIPE_PRICE_ID
  if (!subPriceId) {
    return NextResponse.json({ error: 'No subscription price configured' }, { status: 500 })
  }

  const line_items: { price: string; quantity: number }[] = [{ price: subPriceId, quantity: 1 }]

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items,
      metadata: { userId, tier, interval },
      subscription_data: { metadata: { userId, tier, interval } },
      success_url: `${APP_URL}/dashboard?success=true`,
      cancel_url: `${APP_URL}`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('checkout error:', err)
    return NextResponse.json({ error: 'Stripe error' }, { status: 500 })
  }
}