import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { ensureSharedCoupon, COUPON_ID } from '@/lib/creatorCodes'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

/**
 * Idempotent setup of the shared "$200 off first month" creator coupon.
 *
 * POST /api/admin/setup-creator-coupon  — creates the coupon if missing
 * GET  /api/admin/setup-creator-coupon  — returns its current state
 *
 * Hit this once after deploy. After that, the coupon exists forever and
 * every creator's personal promotion_code points at it.
 */
export async function POST() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const coupon = await ensureSharedCoupon(stripe)
  return NextResponse.json({
    ok: true,
    coupon: {
      id: coupon.id,
      name: coupon.name,
      amount_off: coupon.amount_off,
      duration: coupon.duration,
      times_redeemed: coupon.times_redeemed,
      valid: coupon.valid,
    },
  })
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  try {
    const coupon = await stripe.coupons.retrieve(COUPON_ID)
    return NextResponse.json({ ok: true, exists: true, coupon })
  } catch {
    return NextResponse.json({ ok: true, exists: false })
  }
}
