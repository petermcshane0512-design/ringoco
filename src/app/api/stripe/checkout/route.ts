import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://bellavego.com'

type Tier = 'solo' | 'growth' | 'scale' | 'multiloc'
type Interval = 'monthly' | 'annual'

function priceFor(tier: Tier, interval: Interval): string | undefined {
  const map: Record<Tier, Record<Interval, string | undefined>> = {
    solo: {
      monthly: process.env.STRIPE_PRICE_SOLO_MONTHLY,
      annual: process.env.STRIPE_PRICE_SOLO_ANNUAL,
    },
    growth: {
      monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
      annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
    },
    scale: {
      monthly: process.env.STRIPE_PRICE_SCALE_MONTHLY,
      annual: process.env.STRIPE_PRICE_SCALE_ANNUAL,
    },
    multiloc: {
      monthly: process.env.STRIPE_PRICE_MULTILOC_MONTHLY,
      annual: process.env.STRIPE_PRICE_MULTILOC_ANNUAL,
    },
  }
  return map[tier]?.[interval]
}

function setupPriceFor(tier: Tier): string | undefined {
  const map: Record<Tier, string | undefined> = {
    solo: process.env.STRIPE_PRICE_SOLO_SETUP,
    growth: process.env.STRIPE_PRICE_GROWTH_SETUP,
    scale: process.env.STRIPE_PRICE_SCALE_SETUP,
    multiloc: process.env.STRIPE_PRICE_MULTILOC_SETUP,
  }
  return map[tier]
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    tier?: Tier
    interval?: Interval
    includeSetup?: boolean
  }
  const tier: Tier = body.tier ?? 'growth'
  const interval: Interval = body.interval ?? 'monthly'
  const includeSetup = body.includeSetup ?? true

  const subPriceId = priceFor(tier, interval) ?? process.env.STRIPE_PRICE_ID
  if (!subPriceId) {
    return NextResponse.json({ error: 'No subscription price configured' }, { status: 500 })
  }

  const line_items: { price: string; quantity: number }[] = [{ price: subPriceId, quantity: 1 }]
  if (includeSetup) {
    const setupId = setupPriceFor(tier)
    if (setupId) line_items.push({ price: setupId, quantity: 1 })
  }

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