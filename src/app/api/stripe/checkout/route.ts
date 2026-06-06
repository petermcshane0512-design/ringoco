import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { type Tier, type Interval, priceFor, isValidTier } from '@/lib/pricing'

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
 * Resolve a creator code to the Stripe promotion_code object so checkout
 * can apply the $200-off discount. New personalized codes are stored
 * directly in `ig_creator_outreach.promo_code`. Legacy BAVG-XXXXXX codes
 * never had a Stripe promotion_code minted, so they fall through to
 * attribution-only (no discount).
 *
 * Returns { promotionCodeId, attributionCode } | null.
 */
async function lookupPromoCode(code: string): Promise<{ promotionCodeId: string | null; attributionCode: string }> {
  // Legacy → attribution only, no Stripe discount object
  if (LEGACY_BAVG_REGEX.test(code)) {
    return { promotionCodeId: null, attributionCode: code }
  }
  const { data } = await supabase
    .from('ig_creator_outreach')
    .select('stripe_promotion_code_id, promo_code')
    .eq('promo_code', code)
    .limit(1)
    .single()
  if (data?.stripe_promotion_code_id) {
    return { promotionCodeId: data.stripe_promotion_code_id as string, attributionCode: code }
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
  }
  const tier: Tier = isValidTier(body.tier ?? '') ? (body.tier as Tier) : 'officemgr'
  const interval: Interval = body.interval === 'annual' ? 'annual' : 'monthly'

  // Read creator code from body OR cookie (set by /ref/[code] visit).
  const codeFromBody = normalizeCreatorCode(body.creatorCode)
  const codeFromCookie = normalizeCreatorCode(req.cookies.get('bavg_creator_code')?.value)
  const effectiveCode = codeFromBody || codeFromCookie

  const promoLookup = effectiveCode ? await lookupPromoCode(effectiveCode) : null

  const subPriceId = priceFor(tier, interval)
  const line_items: { price: string; quantity: number }[] = [
    { price: subPriceId, quantity: 1 },
  ]

  try {
    // 2026-06-06 PIVOT — no public trial, no creator trial. Single 30-day
    // money-back guarantee for everyone. Creator code attaches a $200-off
    // first-month promotion_code (Hormozi sub-$100 trip-wire — fan pays
    // $97 first month, $297 from month 2).
    const subscriptionData: Record<string, unknown> = {
      metadata: {
        userId,
        tier,
        interval,
        creator_code: promoLookup?.attributionCode || '',
      },
    }

    const discounts = promoLookup?.promotionCodeId
      ? [{ promotion_code: promoLookup.promotionCodeId }]
      : undefined

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items,
      // If we have a personalized creator code, we pre-apply the Stripe
      // promotion_code via `discounts`. We also disable manual promo entry
      // in that flow (allow_promotion_codes=false) so the user can't stack
      // a second one. Without a creator code, we allow promo entry so
      // future seasonal discounts still work.
      allow_promotion_codes: !discounts,
      ...(discounts ? { discounts } : {}),
      payment_method_collection: 'always',
      metadata: {
        userId,
        tier,
        interval,
        creator_code: promoLookup?.attributionCode || '',
      },
      subscription_data: subscriptionData as never,
      // Risk-reversal banner shown above the Subscribe button on Stripe
      // Checkout. Reinforces the 30-day money-back guarantee at the moment
      // of card entry.
      custom_text: {
        submit: {
          message: '30-day money-back guarantee. If BellAveGo does not earn you back your subscription cost in 30 days, click cancel in your dashboard and we refund every penny — no questions, no calls, no hoops.',
        },
      },
      success_url: `${APP_URL}/dashboard/setup?welcome=1`,
      cancel_url: `${APP_URL}`,
    })

    return NextResponse.json({ url: session.url })
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
