import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * POST /api/stripe/checkout-alacarte
 *
 * 2026-06-09 LEADS-ONLY PIVOT — extra-leads one-time purchase.
 *
 * Existing active subscriber wants more leads mid-month. They click
 * "Buy more leads" on /dashboard/buy-leads, pick a pack size, this
 * route creates a Stripe Checkout session for the one-time charge.
 *
 * On success Stripe redirects to /dashboard/buy-leads?session_id=...
 * and the webhook /api/webhooks/stripe handles the charge.succeeded
 * event, increments the customer's monthly lead quota, and fires
 * /api/agents/find-real-leads to immediately source the extra leads.
 *
 * Packs (Hormozi-style stacked deal — bigger pack = better unit price):
 *   - SINGLE: 1 lead @ $15  ($15/lead)
 *   - PACK_5: 5 leads @ $75  ($15/lead)
 *   - PACK_10: 10 leads @ $140  ($14/lead — small bulk discount)
 *   - PACK_25: 25 leads @ $300  ($12/lead — bigger bulk discount)
 *
 * Auth: signed-in Clerk user must have active subscription. We don't
 * sell extras to non-customers — keeps the trip-wire intact.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://www.bellavego.com'

// 2026-06-09 — custom-amount only. $25/lead flat (Hormozi bump from $15
// — at base $497/mo customer pays $6.21/lead, so extras at $25 stack
// $18.79 margin per add-on). Min 1, max 200.
// Old preset packs (SINGLE/PACK_5/PACK_10/PACK_25 w/ bulk discounts) dropped
// per Peter request — dashboard now uses a single qty input that multiplies
// by $15.
const PRICE_PER_LEAD_CENTS = 2500
const MAX_QTY_PER_PURCHASE = 200

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { qty?: number; pack?: string }
  let qty = 5
  if (typeof body.qty === 'number' && body.qty >= 1) qty = Math.min(MAX_QTY_PER_PURCHASE, Math.floor(body.qty))
  // back-compat: old buy-leads page used { pack: 'PACK_5' } etc
  if (body.pack === 'SINGLE') qty = 1
  else if (body.pack === 'PACK_5') qty = 5
  else if (body.pack === 'PACK_10') qty = 10
  else if (body.pack === 'PACK_25') qty = 25
  const unit_amount = PRICE_PER_LEAD_CENTS * qty
  const label = qty === 1 ? '1 extra lead' : `${qty} extra leads`

  // Pull customer's Stripe customer id (must be active subscriber)
  const { data: pRaw } = await supabase
    .from('profiles')
    .select('stripe_customer_id, is_active, business_name, owner_phone')
    .eq('user_id', userId)
    .maybeSingle()
  const p = pRaw as { stripe_customer_id: string | null; is_active: boolean | null; business_name: string | null; owner_phone: string | null } | null
  if (!p || !p.is_active) {
    return NextResponse.json({ error: 'Active subscription required to buy extra leads' }, { status: 403 })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      ...(p.stripe_customer_id ? { customer: p.stripe_customer_id } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount,
            product_data: {
              name: `BellAveGo · ${label}`,
              description: `${qty} extra exclusive homeowner ${qty === 1 ? 'lead' : 'leads'} in your zip · delivered within 24 hours.`,
            },
          },
        },
      ],
      metadata: {
        userId,
        kind: 'alacarte_leads',
        qty: String(qty),
        unit_price_cents: String(PRICE_PER_LEAD_CENTS),
      },
      custom_text: {
        submit: {
          message: 'Charged as a one-time purchase. Extra leads land in your dashboard within 24 hours. No subscription changes.',
        },
      },
      success_url: `${APP_URL}/dashboard/buy-leads?ok=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/dashboard/buy-leads?cancelled=1`,
    })
    return NextResponse.json({ url: session.url, qty, total_cents: unit_amount })
  } catch (err) {
    const e = err as { message?: string; code?: string; type?: string; raw?: { message?: string } }
    const detail = e.raw?.message || e.message || String(err)
    console.error('[checkout-alacarte] Stripe error:', detail, { qty })
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}
