#!/usr/bin/env node
/**
 * One-shot script: enable `customer.subscription.trial_will_end` (and ensure
 * the other lifecycle events we depend on) on every Stripe webhook endpoint
 * pointing at bellavego.com.
 *
 * Run: node scripts/enable-stripe-trial-events.mjs
 *
 * Idempotent. Lists endpoints, computes the union of (existing ∪ required),
 * updates only when the set actually changed.
 */
import Stripe from 'stripe'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Resolve .env.local relative to THIS file (not cwd) so the script works
// regardless of where it's invoked from.
const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env.local')

// Manual .env.local loader — no dotenv dep. Tolerant: strips BOM, CR, quotes,
// comments, blank lines. Allows lowercase keys + values containing '='.
try {
  let txt = readFileSync(envPath, 'utf8')
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1)  // strip BOM
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key && !process.env[key]) process.env[key] = val
  }
} catch (e) {
  console.warn('.env.local load failed (continuing with process env):', e.message)
}

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY')
  process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const REQUIRED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.deleted',
  'customer.subscription.updated',
  'customer.subscription.trial_will_end',  // NEW — needed for trial expiry warning SMS
  'invoice.payment_succeeded',
  'invoice.payment_failed',
])

async function main() {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
  console.log(`Found ${endpoints.data.length} webhook endpoint(s)`)

  let touched = 0
  for (const ep of endpoints.data) {
    const isBellAveGo = ep.url.includes('bellavego.com') || ep.url.includes('ringoco')
    if (!isBellAveGo) {
      console.log(`  skip   ${ep.id}  ${ep.url}  (not BellAveGo)`)
      continue
    }
    const current = new Set(ep.enabled_events)
    // Wildcard endpoints already cover everything
    if (current.has('*')) {
      console.log(`  ok     ${ep.id}  ${ep.url}  (wildcard *)`)
      continue
    }
    const union = new Set([...current, ...REQUIRED_EVENTS])
    if (union.size === current.size) {
      console.log(`  ok     ${ep.id}  ${ep.url}  (already has trial_will_end)`)
      continue
    }
    const added = [...REQUIRED_EVENTS].filter((e) => !current.has(e))
    console.log(`  update ${ep.id}  ${ep.url}  +${added.join(', ')}`)
    await stripe.webhookEndpoints.update(ep.id, {
      enabled_events: [...union],
    })
    touched++
  }

  console.log(`\nDone. Updated ${touched} endpoint(s).`)
}

main().catch((e) => {
  console.error('FATAL:', e.message ?? e)
  process.exit(1)
})
