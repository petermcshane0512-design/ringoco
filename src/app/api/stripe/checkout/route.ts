import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { type Tier, type Interval, priceFor, isValidTier } from '@/lib/pricing'
import { readUtmFromCookieMap, utmToStripeMetadata } from '@/lib/utm'

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
 *   1. PUBLIC  ($200 off first month, multi-use)  — code stored in promo_code
 *   2. PERSONAL (3 months free, single-use)       — code stored in personal_promo_code
 *   3. LEGACY BAVG-XXXXXX                          — attribution-only, no Stripe discount
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

  // 2026-06-08 — generic public promo fallback (FIRST200 cold-email funnel,
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
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    tier?: string
    interval?: Interval
    creatorCode?: string
    bizId?: string
    zip?: string
    trade?: string
    address?: string
    phone?: string
  }
  const tier: Tier = isValidTier(body.tier ?? '') ? (body.tier as Tier) : 'officemgr'
  const interval: Interval = body.interval === 'annual' ? 'annual' : 'monthly'

  // 2026-06-10 — T3 territory enforcement. zip + trade reach checkout
  // via /start/area's URL params (passed through /pricing). The webhook
  // reads them out of metadata and calls claimTerritory() so the
  // exclusivity promise becomes mechanically real.
  const zip = (body.zip || '').replace(/\D/g, '').slice(0, 5)
  const trade = (body.trade || '').trim().toLowerCase()
  // 2026-06-10 — fix #5: capture address + phone pre-Stripe so the webhook
  // can geocode + stamp profile BEFORE find-real-leads fires. Without these
  // the tight-radius branch in find-real-leads cannot activate on signup,
  // so the first 80-property pull falls back to ZIP-radius (~5mi) instead
  // of the address-anchored 3mi promised on the landing copy.
  // Stripe metadata value cap is 500 chars; address rarely > 100. Truncate
  // defensively. Phone is normalized to E.164-compatible digits string.
  const businessAddress = (body.address || '').trim().slice(0, 200)
  const ownerPhoneDigits = (body.phone || '').replace(/\D/g, '').slice(0, 16)

  // 2026-06-10 — T5 attribution. Forward first-touch UTM cookies (set
  // by /start) into Stripe metadata so the webhook can stamp them on
  // the profile. Powers /admin/retention cohort math.
  const utm = readUtmFromCookieMap((name) => req.cookies.get(name)?.value)
  const utmMeta = utmToStripeMetadata(utm)

  // Read creator code from body OR cookie (set by /ref/[code] visit).
  const codeFromBody = normalizeCreatorCode(body.creatorCode)
  const codeFromCookie = normalizeCreatorCode(req.cookies.get('bavg_creator_code')?.value)
  const effectiveCode = codeFromBody || codeFromCookie

  const promoLookup = effectiveCode ? await lookupPromoCode(effectiveCode) : null

  // 2026-06-09 — pass bizId through from /free-lead?b={biz_id} → /start
  // → checkout → Stripe metadata → webhook so we can attribute conversion
  // back to the original cold-email prospect.
  const bizIdFromBody = (body.bizId || '').slice(0, 64)
  const bizIdFromCookie = (req.cookies.get('bavg_biz_id')?.value || '').slice(0, 64)
  const effectiveBizId = bizIdFromBody || bizIdFromCookie

  const subPriceId = priceFor(tier, interval)
  const line_items: { price: string; quantity: number }[] = [
    { price: subPriceId, quantity: 1 },
  ]

  // 2026-06-06 PIVOT — no public trial, no creator trial. Single 30-day
  // money-back guarantee for everyone. Creator code attaches a $200-off
  // first-month promotion_code (Hormozi sub-$100 trip-wire — fan pays
  // $97 first month, $297 from month 2).
  //
  // 2026-06-07 — discounts field shape changed in dahlia API. Pin checkout
  // to the older API version so promotion_code references work. Plus add
  // fallback: if the discounts-with-promo-id path fails for any reason,
  // retry with allow_promotion_codes: true so the customer can paste the
  // code into Stripe's built-in field. We never lose the sale to a
  // promo-code rejection.
  const CHECKOUT_API_VERSION = '2024-11-20.acacia'

  const subscriptionData: Record<string, unknown> = {
    metadata: {
      userId,
      tier,
      interval,
      creator_code: promoLookup?.attributionCode || '',
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
      tier,
      interval,
      creator_code: promoLookup?.attributionCode || '',
      biz_id: effectiveBizId || '',
      territory_zip: zip,
      territory_trade: trade,
      business_address: businessAddress,
      owner_phone: ownerPhoneDigits,
      ...utmMeta,
    },
    subscription_data: subscriptionData,
    custom_text: {
      submit: {
        message: '30-day money-back guarantee. If BellAveGo does not earn you back your subscription cost in 30 days, click cancel in your dashboard and we refund every penny — no questions, no calls, no hoops.',
      },
    },
    success_url: `${APP_URL}/dashboard/setup?welcome=1`,
    cancel_url: `${APP_URL}`,
  }

  // 2026-06-08 — restore pre-apply path when promo resolves cleanly
  // (cold email FIRST200, creator codes from /ref/[code]). Pre-apply =
  // user sees discount without typing. If pre-apply throws, fall back to
  // allow_promotion_codes so the sale never dies on a promo-code edge case.
  try {
    const session = promoLookup?.promotionCodeId
      ? await stripe.checkout.sessions.create({
          ...baseParams,
          discounts: [{ promotion_code: promoLookup.promotionCodeId }],
        } as never, { apiVersion: CHECKOUT_API_VERSION })
      : await stripe.checkout.sessions.create({
          ...baseParams,
          allow_promotion_codes: true,
        } as never, { apiVersion: CHECKOUT_API_VERSION })
    return NextResponse.json({
      url: session.url,
      ...(promoLookup?.attributionCode ? {
        notice: `Discount ${promoLookup.attributionCode} applied.`,
      } : {}),
    })
  } catch (preApplyErr) {
    console.warn('[checkout] pre-apply failed, falling back to allow_promotion_codes:', (preApplyErr as Error).message)
  }

  try {
    const session = await stripe.checkout.sessions.create({
      ...baseParams,
      allow_promotion_codes: true,
    } as never, { apiVersion: CHECKOUT_API_VERSION })
    return NextResponse.json({
      url: session.url,
      ...(promoLookup?.attributionCode ? {
        notice: `Apply code "${promoLookup.attributionCode}" on the Stripe page for your discount.`,
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
