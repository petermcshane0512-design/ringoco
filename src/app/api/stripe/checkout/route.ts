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
    console.error('[checkout] Stripe error:', { tier, interval, subPriceId, detail, type: errObj.type, code: errObj.code })
    return NextResponse.json(
      { error: detail, code: errObj.code, type: errObj.type, tier, interval },
      { status: 500 },
    )
  }
}