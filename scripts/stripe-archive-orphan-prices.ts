/**
 * Stripe hygiene — T3 of the offer-rebuild plan.
 *
 * 1. Archives the orphaned $147 Starter and $597 Elite prices (V2) by
 *    setting price.active = false. Archive, NOT delete — Stripe doesn't
 *    allow deletion of prices that have ever been used in a subscription,
 *    and we want to preserve them so the grandfathered receptionist /
 *    concierge subscribers keep renewing without 400s.
 *
 * 2. Verifies FIRST400 promotion_code still applies to the $497 monthly
 *    price. Catches drift if someone deactivated the promo accidentally.
 *
 * Requires STRIPE_SECRET_KEY in env. Local .env.local does NOT have it.
 * Run from Vercel CLI:
 *   vercel env pull .env.local
 *   npx tsx scripts/stripe-archive-orphan-prices.ts
 */

import Stripe from 'stripe'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY
if (!STRIPE_KEY) {
  console.error('STRIPE_SECRET_KEY not set. Run `vercel env pull .env.local` first.')
  process.exit(1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2025-09-30.clover' as any })

// V2 orphan price IDs (from src/lib/pricing.ts PRICE_IDS_V2).
// Receptionist $147 + Concierge $597 are unreachable from new checkouts
// (gated by isValidTier returning true only for 'officemgr') but Stripe
// dashboard still surfaces them as active products. Archive to clean up.
const ORPHAN_PRICE_IDS = [
  'price_1TaJOcGrkP7VQmUj8qSiEx2b', // $147/mo Starter / receptionist
  'price_1TaJOcGrkP7VQmUj4AMGChWp', // Starter annual
  'price_1TaJOdGrkP7VQmUjrLltX596', // $597/mo Elite / concierge
  'price_1TaJOdGrkP7VQmUja2CDmocA', // Elite annual
  // 2026-06-09 — Pro annual ($4,997/yr) added to orphan list per P3.
  // Annual toggle removed from /pricing UI; this price is now unreachable
  // from new checkouts but Stripe dashboard still lists it Active.
  'price_1TgUanGrkP7VQmUjujaifNI0', // $4,997/yr Pro annual
]

const ACTIVE_PRO_PRICE_ID = 'price_1TgUZFGrkP7VQmUjw9c5gEXv' // $497/mo Pro
const PROMO_CODE = 'FIRST400'

async function archive() {
  console.log('\n=== Archiving orphan prices ===')
  for (const id of ORPHAN_PRICE_IDS) {
    try {
      const before = await stripe.prices.retrieve(id)
      if (!before.active) {
        console.log(`  ${id} already archived. skip.`)
        continue
      }
      const after = await stripe.prices.update(id, { active: false })
      console.log(`  ✓ archived ${id} ($${(after.unit_amount || 0) / 100}) → active=${after.active}`)
    } catch (e) {
      console.error(`  ✗ ${id}:`, (e as Error).message)
    }
  }
}

async function verifyPromo() {
  console.log('\n=== Verifying FIRST400 promo applies to Pro $497 ===')
  const promo = await stripe.promotionCodes.list({ code: PROMO_CODE, active: true, limit: 1 })
  if (promo.data.length === 0) {
    console.error(`  ✗ no active promotion_code "${PROMO_CODE}" found. checkout will silently fall back to allow_promotion_codes.`)
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promoObj = promo.data[0] as any
  console.log(`  ✓ promotion_code "${PROMO_CODE}" id=${promoObj.id} active=${promoObj.active}`)
  console.log(`    coupon.id=${promoObj.coupon.id} amount_off=$${(promoObj.coupon.amount_off || 0) / 100} duration=${promoObj.coupon.duration}`)

  // Verify the Pro price the promo would be applied to.
  const price = await stripe.prices.retrieve(ACTIVE_PRO_PRICE_ID)
  console.log(`  ✓ Pro price ${price.id}: $${(price.unit_amount || 0) / 100}/${price.recurring?.interval} active=${price.active}`)

  // Simulate the math: amount_off should equal $400 (or 80% off to land at $97).
  const monthly = (price.unit_amount || 0) / 100
  const off = (promoObj.coupon.amount_off || 0) / 100 as number
  const result = monthly - off
  console.log(`    Customer first month = $${monthly} - $${off} = $${result}`)
  if (Math.abs(result - 97) > 0.01) {
    console.warn(`  ⚠ Expected $97 first month, got $${result}. Promo or price drifted.`)
  } else {
    console.log(`  ✓ First-month price math is correct: $97`)
  }
}

async function main() {
  await archive()
  await verifyPromo()
  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
