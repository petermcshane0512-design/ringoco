#!/usr/bin/env node
/**
 * Creates a 100%-off-forever Stripe coupon + a personal promo code
 * "PETER" for the founder's own test/admin account. Idempotent.
 *
 * Run once. Peter then uses code PETER at Stripe checkout = $0 forever,
 * full product access (Twilio number, leads, dashboard).
 *
 * Cleanest path for the owner's account — doesn't pollute the creator
 * referral system (separate coupon id, not tied to ig_creator_outreach).
 */

import Stripe from 'stripe'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env.local')

try {
  const env = readFileSync(envPath, 'utf8')
  env.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  })
} catch (e) { console.error('env read failed:', e.message); process.exit(1) }

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY missing in .env.local')
  process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })
const PROMO_API_VERSION = '2024-11-20.acacia'  // dahlia removed `coupon` param
const COUPON_ID = 'BAVG_FOUNDER_FREE_FOREVER'
const PROMO_CODE = 'PETER'

async function ensureCoupon() {
  try {
    return await stripe.coupons.retrieve(COUPON_ID)
  } catch (e) {
    if (e.code !== 'resource_missing') throw e
    return await stripe.coupons.create({
      id: COUPON_ID,
      name: 'Founder — 100% off forever (admin/test only)',
      percent_off: 100,
      duration: 'forever',
      max_redemptions: 5,  // belt-and-suspenders cap, only Peter should use this
      metadata: {
        purpose: 'founder-test',
        created_by: 'scripts/create-founder-promo.mjs',
      },
    })
  }
}

async function ensurePromoCode(couponId) {
  // Existing?
  const existing = await stripe.promotionCodes.list(
    { code: PROMO_CODE, limit: 1 },
    { apiVersion: PROMO_API_VERSION },
  )
  if (existing.data[0]) return existing.data[0]
  const params = {
    coupon: couponId,
    code: PROMO_CODE,
    active: true,
    max_redemptions: 5,
    metadata: { purpose: 'founder-test', who: 'peter' },
  }
  return await stripe.promotionCodes.create(params, { apiVersion: PROMO_API_VERSION })
}

async function run() {
  console.log('Ensuring founder coupon…')
  const coupon = await ensureCoupon()
  console.log(`  coupon ${coupon.id} (${coupon.percent_off}% off, duration=${coupon.duration})`)

  console.log('Ensuring PETER promo code…')
  const promo = await ensurePromoCode(coupon.id)
  console.log(`  promo ${promo.id} code=${promo.code} active=${promo.active} max_redemptions=${promo.max_redemptions}`)

  console.log(`\n✓ Done. Use code "${PROMO_CODE}" at https://www.bellavego.com/pricing checkout = $0/mo forever.`)
}

run().catch((e) => { console.error(e); process.exit(1) })
