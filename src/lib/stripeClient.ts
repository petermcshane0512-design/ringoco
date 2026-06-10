import Stripe from 'stripe'

/**
 * Lazy Stripe singleton. Construction is deferred until first property
 * access so module-level `import { stripe } from '@/lib/stripeClient'`
 * does NOT throw at Next.js build/page-data-collection time when
 * STRIPE_SECRET_KEY is unbound (Vercel "sensitive" env vars are only
 * injected at runtime, not during the build phase).
 *
 * At runtime, the first property access asserts the env var is set. If
 * it is missing in production, this throws loudly the FIRST time any
 * Stripe call is attempted — never silently uses a placeholder.
 *
 * Replaces the prior `const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, ...)`
 * pattern in 20 route modules. Each route was failing
 * `Failed to collect page data for /api/...` during Vercel build, which
 * triggered fall-back to a stale deployment.
 */

let _instance: Stripe | null = null

function init(): Stripe {
  if (_instance) return _instance
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY env var not set — Stripe API unreachable')
  }
  _instance = new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
  return _instance
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const real = init()
    const value = (real as unknown as Record<string | symbol, unknown>)[prop as string]
    if (typeof value === 'function') return (value as (...args: unknown[]) => unknown).bind(real)
    return value
  },
})
