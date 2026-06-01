#!/usr/bin/env node
/**
 * create-test-coupon.mjs — one-shot script to create founder-only test
 * codes in Stripe.
 *
 * Creates a 100%-off coupon with duration:forever + a human-typable
 * promotion code so Peter (or QA) can run through the full signup →
 * checkout → trial → onboarding flow without ever paying.
 *
 * Idempotent — re-running just confirms existing artifacts. Safe to run
 * twice.
 *
 * Usage:
 *   node scripts/create-test-coupon.mjs
 *
 * Output: prints the promo code + checkout instructions.
 */

import 'dotenv/config'
import Stripe from 'stripe'
import fs from 'node:fs'
import path from 'node:path'

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8')
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) {
      let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  }
}

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('STRIPE_SECRET_KEY missing from .env.local — abort')
  process.exit(1)
}

const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' })

const COUPON_ID = 'peter_test_100off_forever'
const PROMO_CODE = 'PETERTEST'

async function ensureCoupon() {
  try {
    const existing = await stripe.coupons.retrieve(COUPON_ID)
    console.log(`✓ Coupon ${COUPON_ID} already exists (${existing.percent_off}% off, ${existing.duration})`)
    return existing
  } catch (e) {
    if ((e).statusCode !== 404) throw e
  }
  const created = await stripe.coupons.create({
    id: COUPON_ID,
    percent_off: 100,
    duration: 'forever',
    name: 'Founder test — 100% off forever',
    metadata: { internal: 'true', owner: 'peter' },
  })
  console.log(`✓ Created coupon ${created.id} — ${created.percent_off}% off, ${created.duration}`)
  return created
}

async function ensurePromotionCode(coupon) {
  const existing = await stripe.promotionCodes.list({ code: PROMO_CODE, limit: 1 })
  if (existing.data.length > 0) {
    const pc = existing.data[0]
    console.log(`✓ Promo code ${PROMO_CODE} already exists (active=${pc.active}, used=${pc.times_redeemed})`)
    return pc
  }
  const created = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code: PROMO_CODE,
    active: true,
    metadata: { internal: 'true', owner: 'peter' },
  })
  console.log(`✓ Created promo code ${created.code} → coupon ${coupon.id}`)
  return created
}

const coupon = await ensureCoupon()
await ensurePromotionCode(coupon)

console.log('')
console.log('────────────────────────────────────────────────────────')
console.log('READY. Walk the trial as a customer:')
console.log('')
console.log('  1. Open incognito window (so Clerk treats you as new)')
console.log('  2. Visit https://www.bellavego.com/sign-up')
console.log('  3. Sign up with pmcshane+demo1@bellavego.com')
console.log('     (Gmail + alias — lands in your inbox, looks new to Clerk)')
console.log('  4. Fill onboarding form → /pricing')
console.log('  5. Click STARTER → at Stripe checkout, click')
console.log('     "Add promotion code" → enter: PETERTEST')
console.log('  6. Subtotal flips to $0.00 — enter any real card')
console.log('     (Stripe still requires card on file; 100%-off forever')
console.log('      means you will never be charged)')
console.log('  7. Complete checkout → setup wizard fires → done')
console.log('')
console.log('To clean up the test account afterward:')
console.log('  - Cancel the subscription in Stripe (still $0 if you forget)')
console.log('  - Delete the Clerk user in dashboard.clerk.com')
console.log('  - Twilio number auto-releases on cancel via webhook')
console.log('────────────────────────────────────────────────────────')
