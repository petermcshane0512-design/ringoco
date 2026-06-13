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
 * $400-off-first-month discount. Each creator gets their own Stripe
 * promotion_code (vanity, derived from their IG handle) pointing at that
 * coupon — so attribution is automatic at checkout time.
 *
 * Why personalized codes:
 *   - Creator's name on the code = social proof in their DM ("use code HVACMIKE")
 *   - Stripe Dashboard surfaces usage counts per code automatically
 *   - Webhook reads the promotion_code id off the subscription's discount
 *     object → looks up `ig_creator_outreach.promo_code` → knows who to pay
 */

export const COUPON_ID = 'BAVG_400_OFF_FIRST_MONTH'
export const COUPON_AMOUNT_OFF_CENTS = 40000   // $400.00 ($97 first month on $497)
export const COUPON_DURATION: Stripe.CouponCreateParams.Duration = 'once'

// Personal creator coupon: 100% off × 3 months. Single Stripe coupon,
// many single-use promotion_codes pointing at it (one per creator).
export const PERSONAL_COUPON_ID = 'BAVG_3_MONTHS_FREE_CREATOR'

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
 *
 * `column` chooses which slot to check uniqueness against — defaults to
 * the public promo_code column; pass 'personal_promo_code' when minting
 * a creator's single-use 3-month-free code.
 */
export async function findAvailableCode(
  supabase: AnySupabase,
  base: string,
  column: 'promo_code' | 'personal_promo_code' = 'promo_code',
): Promise<string> {
  if (!base) base = 'CREATOR'
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`
    const { data } = await supabase
      .from('ig_creator_outreach')
      .select('id')
      .eq(column, candidate)
      .limit(1)
    if (!data || data.length === 0) return candidate
  }
  // Fallback — should never hit with 200 tries.
  return `${base}${Date.now().toString(36).toUpperCase()}`
}

/**
 * Derive a personal vanity string from an IG handle: `{HANDLE}3MO`.
 * Caps at 16 chars total (Stripe allows 64, but shorter reads better).
 */
export function personalCodeFromHandle(handle: string): string {
  const base = vanityCodeFromHandle(handle)
  if (!base) return 'CREATOR3MO'
  const suffix = '3MO'
  const maxBase = 16 - suffix.length
  return `${base.slice(0, maxBase)}${suffix}`
}

/**
 * Creates the shared $400-off-first-month coupon in Stripe if it doesn't
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
      name: '$400 off first month — creator referral',
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
 * Creates the personal-creator coupon: 100% off × 3 months. Each creator
 * gets their own single-use promotion_code pointing at this coupon. Lets
 * them use BellAveGo Pro free for 3 months as their joining incentive
 * (Hormozi value stack — $891 of product handed over to lock the partner).
 */
export async function ensurePersonalCoupon(stripe: Stripe): Promise<Stripe.Coupon> {
  try {
    return await stripe.coupons.retrieve(PERSONAL_COUPON_ID)
  } catch (e) {
    const err = e as { code?: string }
    if (err.code !== 'resource_missing') throw e
    return await stripe.coupons.create({
      id: PERSONAL_COUPON_ID,
      name: '3 months free — creator partner',
      percent_off: 100,
      duration: 'repeating',
      duration_in_months: 3,
      metadata: {
        purpose: 'creator-personal',
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
// Stripe-Version pin for promotion_codes.create. The 2026-04-22.dahlia API
// release REMOVED `coupon` as an accepted parameter on this endpoint and
// did not document a replacement. Until Stripe ships docs for the new
// "discount" object flow, we send this single call with an older API
// version header so `coupon` is still accepted. Other Stripe calls in the
// codebase continue to use the default dahlia version.
const PROMOTION_CODE_API_VERSION = '2024-11-20.acacia'

/**
 * Mints a SINGLE-USE personal promotion_code (max_redemptions = 1)
 * pointing at the 3-months-free creator coupon. Used when a creator
 * joins as a partner — their personal code lets ONLY them get the 3
 * months free; sharing it with friends has no effect after first use.
 */
export async function mintPersonalPromotionCode(
  stripe: Stripe,
  code: string,
  metadata: Record<string, string>,
): Promise<Stripe.PromotionCode> {
  // Reuse if it already exists (idempotent).
  const existing = await stripe.promotionCodes.list(
    { code, limit: 1 },
    { apiVersion: PROMOTION_CODE_API_VERSION },
  )
  if (existing.data[0]) return existing.data[0]

  const params = {
    coupon: PERSONAL_COUPON_ID,
    code,
    metadata,
    active: true,
    max_redemptions: 1,
  } as unknown as Stripe.PromotionCodeCreateParams
  return await stripe.promotionCodes.create(
    params,
    { apiVersion: PROMOTION_CODE_API_VERSION },
  )
}

export async function mintPromotionCode(
  stripe: Stripe,
  code: string,
  metadata: Record<string, string>,
): Promise<Stripe.PromotionCode> {
  // Same per-call version pin on the LIST call too — keeps the request
  // semantics consistent and avoids subtle param-shape differences
  // between API versions.
  const existing = await stripe.promotionCodes.list(
    { code, limit: 1 },
    { apiVersion: PROMOTION_CODE_API_VERSION },
  )
  if (existing.data[0]) return existing.data[0]

  const params = {
    coupon: COUPON_ID,
    code,
    metadata,
    active: true,
  } as unknown as Stripe.PromotionCodeCreateParams
  return await stripe.promotionCodes.create(
    params,
    { apiVersion: PROMOTION_CODE_API_VERSION },
  )
}
