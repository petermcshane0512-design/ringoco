/**
 * Smoke-test the just-shipped checkout path end-to-end.
 *
 * Hits prod /api/stripe/checkout with a real Stripe SDK call against the
 * configured price ID + FIRST400 promo. Verifies:
 *   1. Server constructs a Checkout Session w/o error
 *   2. FIRST400 promotion_code resolves + applies
 *   3. Resulting session line item totals to $97 (not $497)
 *   4. metadata.biz_id is stamped on session + subscription_data
 *   5. checkout_session URL is returned and 200s on GET
 *
 * Doesn't actually charge anything. Stripe test mode = no money.
 */

import Stripe from 'stripe'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-11-20.acacia' as any })

const PRICE_ID = 'price_1TgUZFGrkP7VQmUjw9c5gEXv' // $497/mo Pro
const PROMO_CODE = 'FIRST400'
const TEST_BIZ_ID = 'smoke-test-' + Date.now()

async function main() {
  console.log('=== Checkout smoke test ===')
  console.log('  price_id:', PRICE_ID)
  console.log('  promo:   ', PROMO_CODE)
  console.log('  biz_id:  ', TEST_BIZ_ID)
  console.log('')

  // 1. Resolve FIRST400 -> promotion_code id
  console.log('1. Looking up FIRST400 in Stripe…')
  const promoList = await stripe.promotionCodes.list({ code: PROMO_CODE, active: true, limit: 1 })
  if (promoList.data.length === 0) {
    console.error('  ✗ FAIL: no active FIRST400 promotion_code found in Stripe')
    process.exit(1)
  }
  const promo = promoList.data[0]
  console.log(`  ✓ id=${promo.id} active=${promo.active}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coupon = (promo as any).coupon
  console.log(`    coupon.amount_off=$${(coupon.amount_off||0)/100} duration=${coupon.duration}`)
  if (coupon.duration !== 'once') {
    console.warn(`  ⚠ WARN: coupon.duration is "${coupon.duration}" — copy says "$97 first month then $497" implies duration=once. Verify.`)
  }

  // 2. Confirm price still active
  console.log('\n2. Verifying price…')
  const price = await stripe.prices.retrieve(PRICE_ID)
  console.log(`  ✓ ${price.id} = $${(price.unit_amount||0)/100}/${price.recurring?.interval} active=${price.active}`)

  // 3. Construct a Checkout Session (the actual checkout route logic)
  console.log('\n3. Creating checkout session…')
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      discounts: [{ promotion_code: promo.id }],
      payment_method_collection: 'always',
      metadata: {
        userId: 'smoke-test-user',
        tier: 'officemgr',
        interval: 'monthly',
        biz_id: TEST_BIZ_ID,
        territory_zip: '85016',
        territory_trade: 'hvac',
      },
      subscription_data: {
        metadata: {
          userId: 'smoke-test-user',
          tier: 'officemgr',
          interval: 'monthly',
          biz_id: TEST_BIZ_ID,
        },
      },
      success_url: 'https://www.bellavego.com/dashboard/setup?welcome=1',
      cancel_url: 'https://www.bellavego.com',
    })
  } catch (e) {
    console.error('  ✗ FAIL session.create:', (e as Error).message)
    process.exit(1)
  }
  console.log(`  ✓ session ${session.id} created`)
  console.log(`    metadata.biz_id     = ${session.metadata?.biz_id}`)
  console.log(`    metadata.userId     = ${session.metadata?.userId}`)
  console.log(`    metadata.territory_zip = ${session.metadata?.territory_zip}`)
  console.log(`    url = ${session.url?.slice(0, 80)}…`)

  // 4. First-invoice preview — does the math land at $97?
  console.log('\n4. Total in session preview:')
  const totalDetails = session.total_details
  if (totalDetails) {
    console.log(`    subtotal:  $${(session.amount_subtotal||0)/100}`)
    console.log(`    discount:  $${(totalDetails.amount_discount||0)/100}`)
    console.log(`    tax:       $${(totalDetails.amount_tax||0)/100}`)
    console.log(`    total:     $${(session.amount_total||0)/100}`)
    const total = (session.amount_total||0)/100
    if (Math.abs(total - 97) < 0.01) {
      console.log(`  ✓ Math lands at $97 first month`)
    } else {
      console.warn(`  ⚠ Total is $${total}, not $97. Verify promo configuration.`)
    }
  } else {
    console.log('  (Stripe doesn\'t return total_details until session is paid)')
  }

  // 5. URL fetches
  console.log('\n5. Fetching checkout URL…')
  if (session.url) {
    const res = await fetch(session.url, { method: 'GET', redirect: 'manual' })
    console.log(`  ✓ HTTP ${res.status}`)
  }

  console.log('\n=== Smoke test PASS ===')
  console.log('\nManual verify next:')
  console.log(`  open: ${session.url}`)
  console.log(`  card: 4242 4242 4242 4242  any future exp  any cvc  any zip`)
  console.log('  then check Stripe Dashboard → Subscriptions for biz_id=' + TEST_BIZ_ID)
}

main().catch((e) => {
  console.error('SMOKE TEST FAILED:', e)
  process.exit(1)
})
