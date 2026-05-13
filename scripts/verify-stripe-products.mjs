#!/usr/bin/env node
/**
 * DEPRECATED (May 12 2026) — this script verified the v4 pricing via env vars
 * (STRIPE_PRICE_RECEPTIONIST_MONTHLY etc.). Those env vars were never reliably
 * populated on Vercel, which is why pricing.ts hardcodes the IDs instead.
 *
 * For v7 pricing ($397/$797/$1,997 as of May 12 2026), see:
 *   - scripts/create-v7-prices.mjs   (creates new Stripe prices)
 *   - src/lib/pricing.ts             (live PRICE_IDS source of truth)
 *
 * Leaving this file in place for historical reference. Do not run.
 */

import Stripe from 'stripe'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env.local')

try {
  const env = readFileSync(envPath, 'utf8')
  env.split(/\r?\n/).forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  })
} catch (e) {
  console.error(`Could not read .env.local at ${envPath}:`, e.message)
  process.exit(1)
}

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY not found after parsing .env.local')
  process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })

// Annuals = 12 months for the price of 10 (16.67% off). Equivalent monthly: $149.17 / $414.17 / $830.83.
const EXPECTED = [
  { env: 'STRIPE_PRICE_RECEPTIONIST_MONTHLY',  amount: 17900,  interval: 'month', label: 'Receptionist Monthly' },
  { env: 'STRIPE_PRICE_RECEPTIONIST_ANNUAL',   amount: 179000, interval: 'year',  label: 'Receptionist Annual ($1,790/yr = 10×$179)' },
  { env: 'STRIPE_PRICE_OFFICEMGR_MONTHLY',     amount: 49700,  interval: 'month', label: 'Office Manager Monthly' },
  { env: 'STRIPE_PRICE_OFFICEMGR_ANNUAL',      amount: 497000, interval: 'year',  label: 'Office Manager Annual ($4,970/yr = 10×$497)' },
  { env: 'STRIPE_PRICE_CONCIERGE_MONTHLY',     amount: 99700,  interval: 'month', label: 'Concierge Monthly' },
  { env: 'STRIPE_PRICE_CONCIERGE_ANNUAL',      amount: 997000, interval: 'year',  label: 'Concierge Annual ($9,970/yr = 10×$997)' },
]

const issues = []
const ok = []

for (const exp of EXPECTED) {
  const id = process.env[exp.env]
  if (!id) {
    issues.push(`MISSING ENV: ${exp.env} not set in .env.local`)
    continue
  }
  try {
    const price = await stripe.prices.retrieve(id)
    const amountOk = price.unit_amount === exp.amount
    const intervalOk = price.recurring?.interval === exp.interval
    if (amountOk && intervalOk && price.active) {
      ok.push(`OK   ${exp.label.padEnd(58)} ${id}  $${(price.unit_amount/100).toFixed(2)}/${price.recurring.interval}`)
    } else {
      const reasons = []
      if (!amountOk) reasons.push(`expected $${(exp.amount/100).toFixed(2)} got $${((price.unit_amount||0)/100).toFixed(2)}`)
      if (!intervalOk) reasons.push(`expected ${exp.interval} got ${price.recurring?.interval}`)
      if (!price.active) reasons.push('price is INACTIVE in Stripe')
      issues.push(`MISMATCH: ${exp.label} (${id}) — ${reasons.join(', ')}`)
    }
  } catch (e) {
    issues.push(`FETCH FAIL: ${exp.label} (${id}) — ${e.message}`)
  }
}

console.log('\n=== Stripe Price Verification ===\n')
ok.forEach(line => console.log(line))
if (issues.length) {
  console.log('\n=== ISSUES ===\n')
  issues.forEach(line => console.log('!! ' + line))
  console.log(`\n${issues.length} issue(s) found.\n`)
  process.exit(1)
}
console.log(`\nAll ${EXPECTED.length} prices match expected v4 pricing. ✓\n`)
