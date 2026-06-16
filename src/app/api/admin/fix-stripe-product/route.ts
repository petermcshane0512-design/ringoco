import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { stripe } from '@/lib/stripeClient'
import { PRICE_IDS_V2 } from '@/lib/pricing'
import { LEADS_PER_WEEK, LEADS_PER_MONTH, BRAND_NAME } from '@/lib/offer'

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

  // 2026-06-13 — enforcement-tier reframe + 1-Job Guarantee.
  // Stripe truncates description visibly around ~140 chars on mobile
  // checkout, so the first sentence is the load-bearing pitch.
  const name = `${BRAND_NAME} — AI homeowner leads`
  const description =
    `${LEADS_PER_WEEK} homeowner leads a week in your service area, exclusive to you — ` +
    `our AI scans city records nightly to find homeowners under municipal orders, fresh permits, storm damage, and recent sales. ` +
    `${LEADS_PER_MONTH}/month total with verified phones + a ready-to-send intro per lead. ` +
    `2 weeks free, then $197/mo. Cancel anytime and you keep every lead.`
  const statementDescriptor = 'BELLAVEGO LEADS'

  try {
    const price = await stripe.prices.retrieve(PRICE_IDS_V2.officemgr.monthly)
    const productId = typeof price.product === 'string' ? price.product : price.product.id
    const before = await stripe.products.retrieve(productId)
    const updated = await stripe.products.update(productId, {
      name,
      description,
      statement_descriptor: statementDescriptor,
    })
    return NextResponse.json({
      ok: true,
      product_id: productId,
      before: {
        name: before.name,
        description: (before.description || '').slice(0, 200),
        statement_descriptor: before.statement_descriptor || null,
      },
      after: {
        name: updated.name,
        description: (updated.description || '').slice(0, 200),
        statement_descriptor: updated.statement_descriptor || null,
      },
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
