import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripeClient'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { ensureSharedCoupon, ensurePersonalCoupon, COUPON_ID, PERSONAL_COUPON_ID } from '@/lib/creatorCodes'

/**
 * Idempotent setup of the TWO creator coupons:
 *   PUBLIC   "$400 off first month"  â†’ fans of creator get $97 first month
 *   PERSONAL "3 months free"         â†’ creator's own subscription
 *
 * POST creates whichever is missing; GET reports current state.
 * Hit this once per environment after deploy.
 */
function summarize(c: Stripe.Coupon) {
  return {
    id: c.id,
    name: c.name,
    amount_off: c.amount_off,
    percent_off: c.percent_off,
    duration: c.duration,
    duration_in_months: c.duration_in_months,
    times_redeemed: c.times_redeemed,
    valid: c.valid,
  }
}

export async function POST() {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
    const publicCoupon = await ensureSharedCoupon(stripe)
    const personalCoupon = await ensurePersonalCoupon(stripe)
    return NextResponse.json({
      ok: true,
      public_coupon: summarize(publicCoupon),
      personal_coupon: summarize(personalCoupon),
    })
  } catch (e) {
    const err = e as { message?: string; raw?: { message?: string } }
    return NextResponse.json({
      ok: false,
      error: err.raw?.message || err.message || String(e),
    }, { status: 500 })
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const out: Record<string, unknown> = { ok: true }
  try {
    const c = await stripe.coupons.retrieve(COUPON_ID)
    out.public_coupon = summarize(c)
    out.public_exists = true
  } catch {
    out.public_exists = false
  }
  try {
    const c = await stripe.coupons.retrieve(PERSONAL_COUPON_ID)
    out.personal_coupon = summarize(c)
    out.personal_exists = true
  } catch {
    out.personal_exists = false
  }
  return NextResponse.json(out)
}
