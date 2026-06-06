#!/usr/bin/env node
/**
 * One-shot backfill — mint a personalized Stripe promotion_code for every
 * existing ig_creator_outreach row that doesn't already have one.
 *
 * Idempotent. Safe to re-run.
 *
 * Usage:
 *   node scripts/backfill-creator-promo-codes.mjs
 *
 * Local-only: needs STRIPE_SECRET_KEY + NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY in .env.local. If you only have Vercel env,
 * pull first: vercel env pull .env.local --environment=production
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
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
} catch (e) {
  console.error(`Could not read .env.local at ${envPath}:`, e.message)
  process.exit(1)
}

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing one of STRIPE_SECRET_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const COUPON_ID = 'BAVG_200_OFF_FIRST_MONTH'

function vanityCodeFromHandle(handle) {
  return handle.replace(/^@/, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

async function findAvailableCode(base) {
  if (!base) base = 'CREATOR'
  for (let i = 0; i < 200; i++) {
    const candidate = i === 0 ? base : `${base}${i + 1}`
    const { data } = await supabase
      .from('ig_creator_outreach')
      .select('id')
      .eq('promo_code', candidate)
      .limit(1)
    if (!data || data.length === 0) return candidate
  }
  return `${base}${Date.now().toString(36).toUpperCase()}`
}

async function ensureCoupon() {
  try {
    return await stripe.coupons.retrieve(COUPON_ID)
  } catch (e) {
    if (e.code !== 'resource_missing') throw e
    return await stripe.coupons.create({
      id: COUPON_ID,
      name: '$200 off first month — creator referral',
      amount_off: 20000,
      currency: 'usd',
      duration: 'once',
      metadata: { purpose: 'creator-referral' },
    })
  }
}

async function mintPromo(code, metadata) {
  const existing = await stripe.promotionCodes.list({ code, limit: 1 })
  if (existing.data[0]) return existing.data[0]
  return await stripe.promotionCodes.create({
    coupon: COUPON_ID,
    code,
    metadata,
    active: true,
  })
}

async function run() {
  console.log('Ensuring shared coupon exists…')
  const coupon = await ensureCoupon()
  console.log(`  coupon ${coupon.id} (${coupon.amount_off} off, ${coupon.duration})`)

  const { data: creators, error } = await supabase
    .from('ig_creator_outreach')
    .select('id, handle, promo_code, stripe_promotion_code_id')
    .or('promo_code.is.null,stripe_promotion_code_id.is.null')
    .limit(2000)
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }

  console.log(`Found ${creators.length} creators missing a promo_code.`)
  let minted = 0, failed = 0
  for (const c of creators) {
    try {
      const base = vanityCodeFromHandle(c.handle ?? '')
      if (!base) { console.warn(`skip ${c.id}: handle "${c.handle}" sanitizes empty`); failed++; continue }
      const finalCode = c.promo_code ?? await findAvailableCode(base)
      const promo = await mintPromo(finalCode, { creator_id: c.id, creator_handle: c.handle ?? '' })
      const { error: updErr } = await supabase
        .from('ig_creator_outreach')
        .update({
          promo_code: finalCode,
          stripe_promotion_code_id: promo.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', c.id)
      if (updErr) { console.error(`update failed for ${c.handle}:`, updErr.message); failed++; continue }
      console.log(`  ✓ @${c.handle} → ${finalCode}  (${promo.id})`)
      minted++
    } catch (e) {
      console.error(`  ✗ @${c.handle}:`, e.message)
      failed++
    }
  }
  console.log(`\nDone. Minted ${minted}. Failed ${failed}.`)
}

run().catch((e) => { console.error(e); process.exit(1) })
