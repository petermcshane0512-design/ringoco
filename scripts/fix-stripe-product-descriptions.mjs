#!/usr/bin/env node
/**
 * Updates Stripe product names + descriptions to the 2026-06-06 single-tier
 * Hormozi offer ($297/mo · unlimited calls · 5 leads every Monday · 30-day
 * money-back guarantee). Run after the codebase pricing pivot so the
 * description on Stripe Checkout no longer reads "7-day free trial" or the
 * old "300 calls/month · Quote Hunter, Collections, Reviews" line.
 *
 * Product IDs are hardcoded — they match the prod_… IDs documented in
 * src/lib/pricing.ts above PRICE_IDS_V2.
 */

import Stripe from 'stripe'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env.vercel-tmp')

try {
  const env = readFileSync(envPath, 'utf8')
  env.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  })
} catch (e) {
  console.error(`Could not read .env.local at ${envPath}:`, e.message)
  process.exit(1)
}

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY missing.')
  process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })

const UPDATES = [
  {
    id: 'prod_UVUw8kOSSqciIr',
    name: 'BellAveGo Starter',
    description:
      'AI receptionist answers every missed call in your business name. Lead captured + texted to your phone in 20 seconds. 30-day money-back guarantee.',
  },
  {
    id: 'prod_UVUwulTFFELqnk',
    name: 'BellAveGo',
    description:
      'Unlimited calls answered by your AI receptionist. 5 fresh neighborhood leads delivered every Monday — real homeowners in your service area with contact info + pitch script. Auto-booking, lead alerts, Google review manager, monthly revenue intelligence reports. 30-day money-back guarantee: if it doesn\'t pay for itself in 30 days, click cancel in your dashboard and we refund every penny.',
  },
  {
    id: 'prod_UVUwZwbvhdpRwR',
    name: 'BellAveGo Elite',
    description:
      'Everything in BellAveGo plus the full AI Marketing Operations stack — ad creative generator, permit + storm lead sourcing, competitor watcher, local SEO, custom CRM integrations, 4-hour priority SLA, direct founder access. 30-day money-back guarantee.',
  },
]

for (const u of UPDATES) {
  try {
    const before = await stripe.products.retrieve(u.id)
    console.log(`\n[${u.id}] BEFORE`)
    console.log(`  name:        ${before.name}`)
    console.log(`  description: ${before.description}`)
    const after = await stripe.products.update(u.id, {
      name: u.name,
      description: u.description,
    })
    console.log(`[${u.id}] AFTER`)
    console.log(`  name:        ${after.name}`)
    console.log(`  description: ${after.description}`)
  } catch (e) {
    console.error(`[${u.id}] failed:`, e.message)
  }
}

console.log('\nDone.')
