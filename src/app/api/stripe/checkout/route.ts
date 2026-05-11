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

// HARDCODED v6 pricing (May 11 2026). No env var indirection — values change here.
// Why hardcoded: Vercel env vars failed to populate via CLI repeatedly. Code is the
// source of truth. Update these IDs (and bump the comment date) when prices change.
// Verified via Stripe API: every ID below resolves to the labeled amount.
const PRICE_IDS: Record<Tier, { monthly: string; annual: string; setup: string }> = {
  receptionist: {
    monthly: 'price_1TVLzIGrkP7VQmUjInufjfVe', // $179/mo
    annual:  'price_1TVLzIGrkP7VQmUjoV1TYYMd', // $1,790/yr
    setup:   'price_1TVa1XGrkP7VQmUjC3kilwOR', // $50 setup
  },
  officemgr: {
    monthly: 'price_1TVXDFGrkP7VQmUjOVB3qgOh', // $497/mo
    annual:  'price_1TVXDFGrkP7VQmUjInUFNEni', // $4,970/yr
    setup:   'price_1TVa1YGrkP7VQmUjHQMyQvZS', // $247 setup
  },
  concierge: {
    monthly: 'price_1TVXDGGrkP7VQmUjsBtcKsrE', // $997/mo
    annual:  'price_1TVXDGGrkP7VQmUjbwIIv7qu', // $9,970/yr
    setup:   'price_1TVa1YGrkP7VQmUjg7AQL6Y2', // $497 setup
  },
}

function priceFor(tier: Tier, interval: Interval): string {
  return PRICE_IDS[tier][interval]
}

function setupPriceFor(tier: Tier): string {
  return PRICE_IDS[tier].setup
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

  // v6 pricing: subscription + non-refundable onboarding fee per tier.
  // 30-day money-back on the subscription only (setup covers real onboarding work).
  const subPriceId = priceFor(tier, interval)
  const setupPriceId = setupPriceFor(tier)

  const line_items: { price: string; quantity: number }[] = [
    { price: subPriceId, quantity: 1 },
    { price: setupPriceId, quantity: 1 },
  ]

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
    // Surface the actual Stripe error so we can debug instead of guessing
    const errObj = err as { message?: string; code?: string; type?: string; raw?: { message?: string } }
    const detail = errObj.raw?.message || errObj.message || String(err)
    console.error('[checkout] Stripe error:', { tier, interval, subPriceId, setupPriceId, detail, type: errObj.type, code: errObj.code })
    return NextResponse.json(
      { error: detail, code: errObj.code, type: errObj.type, tier, interval },
      { status: 500 },
    )
  }
}