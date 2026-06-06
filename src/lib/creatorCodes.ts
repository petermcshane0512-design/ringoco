import Stripe from 'stripe'

// Loose Supabase client type — these helpers only need .from().select().eq()
// chaining, so we accept any client and dodge the generic-instantiation mismatch
// between client construction styles in the codebase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any

/**
 * Creator-referral promo code helpers.
 *
 * One shared Stripe coupon (`BAVG_200_OFF_FIRST_MONTH`) provides the actual
 * $200-off-first-month discount. Each creator gets their own Stripe
 * promotion_code (vanity, derived from their IG handle) pointing at that
 * coupon — so attribution is automatic at checkout time.
 *
 * Why personalized codes:
 *   - Creator's name on the code = social proof in their DM ("use code HVACMIKE")
 *   - Stripe Dashboard surfaces usage counts per code automatically
 *   - Webhook reads the promotion_code id off the subscription's discount
 *     object → looks up `ig_creator_outreach.promo_code` → knows who to pay
 */

export const COUPON_ID = 'BAVG_200_OFF_FIRST_MONTH'
export const COUPON_AMOUNT_OFF_CENTS = 20000   // $200.00
export const COUPON_DURATION: Stripe.CouponCreateParams.Duration = 'once'

/**
 * Sanitize an IG handle into a Stripe promotion_code string.
 *   "@hvac.mike"     → "HVACMIKE"
 *   "plumber_jon_az" → "PLUMBERJONAZ"
 *   "sparky-dan"     → "SPARKYDAN"
 * Stripe allows [A-Z0-9_-] up to 64 chars. We trim to 12 for thumb-typeability.
 */
export function vanityCodeFromHandle(handle: string): string {
  return handle
    .replace(/^@/, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
}

/**
 * Try a vanity code; if Supabase says it's taken, append numeric suffix
 * until free. Returns the final code (never null).
 */
export async function findAvailableCode(
  supabase: AnySupabase,
  base: string,
): Promise<string> {
  if (!base) base = 'CREATOR'
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`
    const { data } = await supabase
      .from('ig_creator_outreach')
      .select('id')
      .eq('promo_code', candidate)
      .limit(1)
    if (!data || data.length === 0) return candidate
  }
  // Fallback — should never hit with 200 tries.
  return `${base}${Date.now().toString(36).toUpperCase()}`
}

/**
 * Creates the shared $200-off-first-month coupon in Stripe if it doesn't
 * already exist. Idempotent. Returns the coupon object either way.
 */
export async function ensureSharedCoupon(stripe: Stripe): Promise<Stripe.Coupon> {
  try {
    return await stripe.coupons.retrieve(COUPON_ID)
  } catch (e) {
    const err = e as { code?: string }
    if (err.code !== 'resource_missing') throw e
    return await stripe.coupons.create({
      id: COUPON_ID,
      name: '$200 off first month — creator referral',
      amount_off: COUPON_AMOUNT_OFF_CENTS,
      currency: 'usd',
      duration: COUPON_DURATION,
      metadata: {
        purpose: 'creator-referral',
        created_by: 'src/lib/creatorCodes.ts',
      },
    })
  }
}

/**
 * Mints a Stripe promotion_code for a creator, pointing at the shared
 * coupon. Idempotent on the (code, coupon) pair — if the code already
 * exists in Stripe, returns the existing object.
 */
export async function mintPromotionCode(
  stripe: Stripe,
  code: string,
  metadata: Record<string, string>,
): Promise<Stripe.PromotionCode> {
  // Look up existing by code first — Stripe doesn't enforce unique on
  // promotion_codes globally, but our DB does, so this is just an extra
  // belt-and-suspenders on Stripe's side.
  const existing = await stripe.promotionCodes.list({ code, limit: 1 })
  if (existing.data[0]) return existing.data[0]

  // Stripe API 2026-04 still accepts `coupon` on promotionCodes.create, but
  // the TypeScript types lag — cast through `as never` so the call compiles.
  // Tested against the live Dahlia API on 2026-06-06.
  const params = {
    coupon: COUPON_ID,
    code,
    metadata,
    active: true,
  } as unknown as Stripe.PromotionCodeCreateParams
  return await stripe.promotionCodes.create(params)
}
