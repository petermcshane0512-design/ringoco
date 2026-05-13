/**
 * One-time script: creates the v7 BellAveGo Stripe prices.
 *
 * Tiers (3) × variants (monthly / annual / setup) = 9 prices.
 * Idempotent on products via metadata.lookup_key — re-running creates new
 * prices on the same product (Stripe prices are immutable, so multiple revs
 * is normal; archive the obsolete ones in the Dashboard later).
 *
 * Run once:
 *   cd C:\Users\peter\ringoco
 *   node scripts/create-v7-prices.mjs
 *
 * Output is JSON to stdout AND to /tmp/v7-price-ids.json for parsing.
 */

// Run with: node --env-file=.env.local scripts/create-v7-prices.mjs
import Stripe from 'stripe'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY not set in env. Aborting.')
  process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })
const isLive = process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')

const TIERS = {
  receptionist: {
    name: 'BellAveGo Receptionist',
    monthlyCents: 39700,
    annualCents: 396000,
    setupCents: 25000,
  },
  officemgr: {
    name: 'BellAveGo Office Manager',
    monthlyCents: 79700,
    annualCents: 794000,
    setupCents: 50000,
  },
  concierge: {
    name: 'BellAveGo Concierge',
    monthlyCents: 199700,
    annualCents: 1992000,
    setupCents: 100000,
  },
}

console.log('')
console.log(`${isLive ? '!!  LIVE MODE' : 'OK  TEST MODE'} — creating v7 prices in ${isLive ? 'PRODUCTION' : 'test'} Stripe`)
console.log('')

const results = {}

for (const [tierKey, tier] of Object.entries(TIERS)) {
  console.log(`\n[${tierKey}]`)

  // Idempotent product reuse via metadata lookup_key
  let product
  const productLookupKey = `bellavego-${tierKey}-v7`
  try {
    const existing = await stripe.products.search({
      query: `metadata['lookup_key']:'${productLookupKey}'`,
    })
    if (existing.data.length > 0) {
      product = existing.data[0]
      console.log(`  reused product ${product.id}`)
    }
  } catch (e) {
    console.log(`  product search failed (${e.message}), will create new`)
  }

  if (!product) {
    product = await stripe.products.create({
      name: tier.name,
      metadata: { lookup_key: productLookupKey, version: 'v7' },
    })
    console.log(`  created product ${product.id}`)
  }

  const monthly = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: tier.monthlyCents,
    recurring: { interval: 'month' },
    nickname: `${tierKey} v7 monthly`,
    metadata: { tier: tierKey, interval: 'monthly', version: 'v7' },
  })
  console.log(`  monthly  ${monthly.id}  $${tier.monthlyCents / 100}/mo`)

  const annual = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: tier.annualCents,
    recurring: { interval: 'year' },
    nickname: `${tierKey} v7 annual`,
    metadata: { tier: tierKey, interval: 'annual', version: 'v7' },
  })
  console.log(`  annual   ${annual.id}  $${tier.annualCents / 100}/yr`)

  const setup = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: tier.setupCents,
    nickname: `${tierKey} v7 setup`,
    metadata: { tier: tierKey, kind: 'setup', version: 'v7' },
  })
  console.log(`  setup    ${setup.id}  $${tier.setupCents / 100} one-time`)

  results[tierKey] = {
    productId: product.id,
    monthly: monthly.id,
    annual: annual.id,
    setup: setup.id,
    monthlyCents: tier.monthlyCents,
    annualCents: tier.annualCents,
    setupCents: tier.setupCents,
  }
}

console.log('\n\n=== ALL PRICES CREATED ===\n')
console.log(JSON.stringify(results, null, 2))

const outPath = path.join(os.tmpdir(), 'v7-price-ids.json')
fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
console.log(`\nWritten to ${outPath} for downstream parsing.`)
