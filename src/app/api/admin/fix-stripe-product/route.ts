import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { stripe } from '@/lib/stripeClient'
import { PRICE_IDS_V2 } from '@/lib/pricing'
import { LEADS_PER_WEEK, LEADS_PER_MONTH } from '@/lib/offer'

/**
 * GET /api/admin/fix-stripe-product — 2026-06-12 per Peter.
 *
 * The Stripe checkout page was still showing the MOTHBALLED receptionist
 * description ("Unlimited calls answered by your AI receptionist...") at
 * the exact moment of payment — the product description was written
 * pre-pivot and never updated when the offer became pure lead-gen.
 *
 * The Stripe secret key is Vercel-sensitive (unreadable locally), so this
 * route updates the product server-side where the key lives. Admin-gated;
 * idempotent — safe to hit again whenever the offer copy changes (it
 * re-derives from src/lib/offer.ts constants, the single source of truth).
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const description =
    `${LEADS_PER_WEEK} exclusive homeowner leads every week in your area — ` +
    `real addresses from city records, verified contact info, delivered to your dashboard. ` +
    `AI texts + emails every lead as your shop; you just call the YES's. ` +
    `One contractor per trade per area — your leads are never shared. ` +
    `${LEADS_PER_MONTH}/mo total. 30-day money-back guarantee: if it doesn't pay for itself, ` +
    `cancel in your dashboard and we refund every penny.`

  try {
    const price = await stripe.prices.retrieve(PRICE_IDS_V2.officemgr.monthly)
    const productId = typeof price.product === 'string' ? price.product : price.product.id
    const before = await stripe.products.retrieve(productId)
    const updated = await stripe.products.update(productId, { description })
    return NextResponse.json({
      ok: true,
      product_id: productId,
      before: (before.description || '').slice(0, 140),
      after: (updated.description || '').slice(0, 140),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
