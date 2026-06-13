import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripeClient'
import { auth } from '@clerk/nextjs/server'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { type Tier, type Interval, priceFor, isValidTier } from '@/lib/pricing'
import { readUtmFromCookieMap, utmToStripeMetadata } from '@/lib/utm'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://www.bellavego.com'

// Two accepted code formats:
//   PERSONALIZED   HVACMIKE, PLUMBERJON     (current Stripe promotion_code path)
//   LEGACY         BAVG-XXXXXX              (old DMs still in the wild)
const PERSONALIZED_REGEX = /^[A-Z0-9]{1,12}$/
const LEGACY_BAVG_REGEX = /^BAVG-[A-Z0-9]{6}$/

function normalizeCreatorCode(raw: string | undefined | null): string | null {
  const code = (raw || '').trim().toUpperCase()
  if (!code) return null
  if (LEGACY_BAVG_REGEX.test(code)) return code
  if (PERSONALIZED_REGEX.test(code)) return code
  return null
}

/**
 * Resolve a creator code to a Stripe promotion_code so checkout can apply
 * the right discount. Two code lookups in order:
 *   1. PUBLIC  ($200 off first month, multi-use)  â€” code stored in promo_code
 *   2. PERSONAL (3 months free, single-use)       â€” code stored in personal_promo_code
 *   3. LEGACY BAVG-XXXXXX                          â€” attribution-only, no Stripe discount
 *
 * Returns the discount target + the attribution string we stamp on the
 * subscription metadata so the webhook can credit the right creator.
 */
async function lookupPromoCode(code: string): Promise<{ promotionCodeId: string | null; attributionCode: string }> {
  if (LEGACY_BAVG_REGEX.test(code)) {
    return { promotionCodeId: null, attributionCode: code }
  }

  // Try public code first.
  const pub = await supabase
    .from('ig_creator_outreach')
    .select('stripe_promotion_code_id, promo_code')
    .eq('promo_code', code)
    .limit(1)
    .maybeSingle()
  if (pub.data?.stripe_promotion_code_id) {
    return { promotionCodeId: pub.data.stripe_promotion_code_id as string, attributionCode: code }
  }

  // Fall through to personal code (creator signing up themselves).
  const personal = await supabase
    .from('ig_creator_outreach')
    .select('personal_stripe_promotion_code_id, personal_promo_code')
    .eq('personal_promo_code', code)
    .limit(1)
    .maybeSingle()
  if (personal.data?.personal_stripe_promotion_code_id) {
    return { promotionCodeId: personal.data.personal_stripe_promotion_code_id as string, attributionCode: code }
  }

  // 2026-06-08 â€” generic public promo fallback (FIRST200 cold-email funnel,
  // future public marketing codes). Code isn't in ig_creator_outreach so
  // check Stripe directly for any active promotion code matching this string.
  try {
    const stripeList = await stripe.promotionCodes.list({ code, limit: 5, active: true })
    const hit = stripeList.data.find((p) => p.code === code && p.active)
    if (hit) {
      return { promotionCodeId: hit.id, attributionCode: code }
    }
  } catch (e) {
    console.warn('[checkout] Stripe promotionCodes.list failed for', code, (e as Error).message)
  }

  return { promotionCodeId: null, attributionCode: code }
}

export async function POST(req: NextRequest) {
  // 2026-06-10 — FRICTIONLESS CHECKOUT (per Peter). Clerk auth NO LONGER
  // gates Stripe Checkout. Anonymous prospects can swipe card immediately;
  // webhook creates Clerk user from Stripe-collected email post-payment +
  // returns sign-in token via success_url so /checkout/return signs them
  // in automatically. Net friction: 4 steps → 1 (card itself).
  //
  // Algorithm step 2 applied: deleted the auth() gate. Step 3: anon flow
  // generates a one-shot `anon_<uuid>` placeholder userId stamped on
  // Stripe metadata; webhook swaps it for the real Clerk user_id once
  // checkout.session.completed fires + the Clerk user is created.
  const { userId: clerkUserId } = await auth()
  const isAnon = !clerkUserId
  const userId = clerkUserId ?? `anon_${crypto.randomUUID()}`

  const body = await req.json().catch(() => ({})) as {
    tier?: string
    interval?: Interval
    creatorCode?: string
    bizId?: string
    zip?: string
    trade?: string
    address?: string
    phone?: string
    email?: string
  }
  const tier: Tier = isValidTier(body.tier ?? '') ? (body.tier as Tier) : 'officemgr'
  const interval: Interval = body.interval === 'annual' ? 'annual' : 'monthly'

  // 2026-06-10 â€” T3 territory enforcement. zip + trade reach checkout
  // via /start/area's URL params (passed through /pricing). The webhook
  // reads them out of metadata and calls claimTerritory() so the
  // exclusivity promise becomes mechanically real.
  const zip = (body.zip || '').replace(/\D/g, '').slice(0, 5)
  const trade = (body.trade || '').trim().toLowerCase()
  // 2026-06-10 â€” fix #5: capture address + phone pre-Stripe so the webhook
  // can geocode + stamp profile BEFORE find-real-leads fires. Without these
  // the tight-radius branch in find-real-leads cannot activate on signup,
  // so the first 80-property pull falls back to ZIP-radius (~5mi) instead
  // of the address-anchored 3mi promised on the landing copy.
  // Stripe metadata value cap is 500 chars; address rarely > 100. Truncate
  // defensively. Phone is normalized to E.164-compatible digits string.
  const businessAddress = (body.address || '').trim().slice(0, 200)
  const ownerPhoneDigits = (body.phone || '').replace(/\D/g, '').slice(0, 16)

  // 2026-06-10 â€” T5 attribution. Forward first-touch UTM cookies (set
  // by /start) into Stripe metadata so the webhook can stamp them on
  // the profile. Powers /admin/retention cohort math.
  const utm = readUtmFromCookieMap((name) => req.cookies.get(name)?.value)
  const utmMeta = utmToStripeMetadata(utm)

  // Read creator code from body OR cookie (set by /ref/[code] visit).
  const codeFromBody = normalizeCreatorCode(body.creatorCode)
  const codeFromCookie = normalizeCreatorCode(req.cookies.get('bavg_creator_code')?.value)
  const effectiveCode = codeFromBody || codeFromCookie

  const promoLookup = effectiveCode ? await lookupPromoCode(effectiveCode) : null

  // 2026-06-09 â€” pass bizId through from /free-lead?b={biz_id} â†’ /start
  // â†’ checkout â†’ Stripe metadata â†’ webhook so we can attribute conversion
  // back to the original cold-email prospect.
  const bizIdFromBody = (body.bizId || '').slice(0, 64)
  const bizIdFromCookie = (req.cookies.get('bavg_biz_id')?.value || '').slice(0, 64)
  const effectiveBizId = bizIdFromBody || bizIdFromCookie

  // 2026-06-12 — customer-to-customer referral attribution. The `bavg_ref`
  // cookie (set by middleware on ?ref=BAVG-XXXXXX) is a SEPARATE channel from
  // creator promo codes: it rewards the REFERRER a free month, gives the
  // friend NO discount, and must NOT pass through lookupPromoCode (it's an
  // attribution code, not a Stripe promo). Carried as its own metadata field
  // so the webhook can set profiles.referred_by → recordPendingReferral.
  const refCookie = (req.cookies.get('bavg_ref')?.value || '').toUpperCase().trim()
  const validReferralCode = /^BAVG-[A-Z0-9]{6}$/.test(refCookie) ? refCookie : ''

  const subPriceId = priceFor(tier, interval)
  const line_items: { price: string; quantity: number }[] = [
    { price: subPriceId, quantity: 1 },
  ]

  // 2026-06-06 PIVOT â€” no public trial, no creator trial. Single 30-day
  // money-back guarantee for everyone. Creator code attaches a $200-off
  // first-month promotion_code (Hormozi sub-$100 trip-wire â€” fan pays
  // $97 first month, $297 from month 2).
  //
  // 2026-06-07 â€” discounts field shape changed in dahlia API. Pin checkout
  // to the older API version so promotion_code references work. Plus add
  // fallback: if the discounts-with-promo-id path fails for any reason,
  // retry with allow_promotion_codes: true so the customer can paste the
  // code into Stripe's built-in field. We never lose the sale to a
  // promo-code rejection.
  const CHECKOUT_API_VERSION = '2024-11-20.acacia'

  const subscriptionData: Record<string, unknown> = {
    metadata: {
      userId,
      anon: isAnon ? '1' : '',
      tier,
      interval,
      creator_code: promoLookup?.attributionCode || '',
      referral_code: validReferralCode,
      biz_id: effectiveBizId || '',
      territory_zip: zip,
      territory_trade: trade,
      business_address: businessAddress,
      owner_phone: ownerPhoneDigits,
      ...utmMeta,
    },
  }

  const baseParams = {
    payment_method_types: ['card'] as const,
    mode: 'subscription' as const,
    line_items,
    payment_method_collection: 'always' as const,
    metadata: {
      userId,
      anon: isAnon ? '1' : '',
      tier,
      interval,
      creator_code: promoLookup?.attributionCode || '',
      referral_code: validReferralCode,
      biz_id: effectiveBizId || '',
      territory_zip: zip,
      territory_trade: trade,
      business_address: businessAddress,
      owner_phone: ownerPhoneDigits,
      ...utmMeta,
    },
    subscription_data: subscriptionData,
    // 2026-06-10 — anon flow: pre-fill the email if /start/area collected
    // it, otherwise let Stripe collect during checkout. Webhook reads
    // session.customer_details.email regardless.
    ...(isAnon && body.email ? { customer_email: body.email.trim().slice(0, 200) } : {}),
    custom_text: {
      submit: {
        message: '30-day money-back guarantee. If BellAveGo does not earn you back your subscription cost in 30 days, click cancel in your dashboard and we refund every penny â€” no questions, no calls, no hoops.',
      },
    },
    // 2026-06-10 — per Peter: kill the 7-step wizard. Sign up -> first 10
    // leads. /dashboard/leads renders the lead drop immediately. Anything
    // the wizard captured (sub_trade, value_props, outreach_tone) is now
    // optional polish; tenants can fill it later via Settings.
    // 2026-06-10 — anon flow needs the session_id so /checkout/return
    // can look up the Clerk sign-in token the webhook stashed in metadata.
    // Authed flow tolerates the same param (just ignores it).
    success_url: `${APP_URL}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}`,
  }

  // 2026-06-10 — per Peter: always allow_promotion_codes so the user
  // can REMOVE / SWAP a pre-applied code at the Stripe page. Pre-apply
  // via `discounts: [{ promotion_code }]` LOCKS the code — visitor can
  // not type a different one in the checkout UI. Trade: cold-email
  // landings no longer see $97 auto-displayed; they paste FIRST400
  // themselves. Attribution still stamped via metadata.creator_code
  // regardless of whether the visitor actually types the code.
  try {
    const session = await stripe.checkout.sessions.create({
      ...baseParams,
      allow_promotion_codes: true,
    } as never, { apiVersion: CHECKOUT_API_VERSION })
    return NextResponse.json({
      url: session.url,
      ...(promoLookup?.attributionCode ? {
        notice: `Type code "${promoLookup.attributionCode}" on the Stripe page for your discount.`,
      } : {}),
    })
  } catch (err) {
    const errObj = err as { message?: string; code?: string; type?: string; raw?: { message?: string } }
    const detail = errObj.raw?.message || errObj.message || String(err)
    console.error('[checkout] Stripe error:', { tier, interval, subPriceId, detail, type: errObj.type, code: errObj.code })
    return NextResponse.json(
      { error: detail, code: errObj.code, type: errObj.type, tier, interval },
      { status: 500 },
    )
  }
}
