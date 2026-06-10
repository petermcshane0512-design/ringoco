import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripeClient'
import { requireAdmin } from '@/lib/auth/requireAdmin'

const PROMO_API_VERSION = '2024-11-20.acacia'
const COUPON_ID = 'BAVG_FOUNDER_FREE_FOREVER'
const PROMO_CODE = 'PETER'

/**
 * POST /api/admin/setup-founder-promo
 *
 * Idempotent setup of the founder-only "$0 forever" Stripe coupon +
 * promo code "PETER". Used so Peter can sign up bellavegollc@gmail.com
 * for free, get a Twilio number provisioned, dogfood the product without
 * polluting customer count or burning real Stripe revenue.
 *
 * max_redemptions = 5 on both coupon AND promo code as belt-and-suspenders
 * cap. Only Peter should use this. After 5 uses, it deactivates.
 */
export async function POST() {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res

    // Coupon
    let coupon: Stripe.Coupon
    try {
      coupon = await stripe.coupons.retrieve(COUPON_ID)
    } catch (e) {
      const err = e as { code?: string }
      if (err.code !== 'resource_missing') throw e
      coupon = await stripe.coupons.create({
        id: COUPON_ID,
        name: 'Founder â€” 100% off forever (admin/test only)',
        percent_off: 100,
        duration: 'forever',
        max_redemptions: 5,
        metadata: { purpose: 'founder-test', created_by: 'api/admin/setup-founder-promo' },
      })
    }

    // Promo code
    const existing = await stripe.promotionCodes.list(
      { code: PROMO_CODE, limit: 1 },
      { apiVersion: PROMO_API_VERSION },
    )
    let promo = existing.data[0]
    if (!promo) {
      const params = {
        coupon: coupon.id,
        code: PROMO_CODE,
        active: true,
        max_redemptions: 5,
        metadata: { purpose: 'founder-test', who: 'peter' },
      } as unknown as Stripe.PromotionCodeCreateParams
      promo = await stripe.promotionCodes.create(params, { apiVersion: PROMO_API_VERSION })
    }

    return NextResponse.json({
      ok: true,
      coupon: {
        id: coupon.id,
        percent_off: coupon.percent_off,
        duration: coupon.duration,
        times_redeemed: coupon.times_redeemed,
        max_redemptions: coupon.max_redemptions,
      },
      promo_code: {
        id: promo.id,
        code: promo.code,
        active: promo.active,
        max_redemptions: promo.max_redemptions,
        times_redeemed: promo.times_redeemed,
      },
      instructions: `Sign up at https://www.bellavego.com/sign-up with bellavegollc@gmail.com â†’ checkout â†’ paste code "${PROMO_CODE}" at Stripe â†’ $0/mo forever.`,
    })
  } catch (e) {
    const err = e as { message?: string; raw?: { message?: string } }
    return NextResponse.json({
      ok: false,
      error: err.raw?.message || err.message || String(e),
    }, { status: 500 })
  }
}
