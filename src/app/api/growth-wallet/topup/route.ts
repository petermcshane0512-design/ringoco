import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://www.bellavego.com'

const ALLOWED_AMOUNTS_CENTS = new Set([100000, 250000, 500000])  // $1K, $2.5K, $5K

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('plan_tier, is_active, stripe_customer_id').eq('user_id', userId).maybeSingle()
  if (profile?.plan_tier !== 'concierge') {
    return NextResponse.json({ error: 'Concierge tier required' }, { status: 403 })
  }

  const { amountCents } = (await req.json().catch(() => ({}))) as { amountCents?: number }
  if (!amountCents || !ALLOWED_AMOUNTS_CENTS.has(amountCents)) {
    return NextResponse.json({ error: 'Invalid amount. Pick $1,000 / $2,500 / $5,000.' }, { status: 400 })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer: profile.stripe_customer_id ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: { name: `Growth Wallet top-up — $${(amountCents / 100).toLocaleString()}` },
          },
          quantity: 1,
        },
      ],
      metadata: { kind: 'wallet_topup', userId, amountCents: String(amountCents) },
      success_url: `${APP_URL}/dashboard/concierge?topup=success`,
      cancel_url: `${APP_URL}/dashboard/concierge?topup=cancel`,
    })
    return NextResponse.json({ url: session.url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
