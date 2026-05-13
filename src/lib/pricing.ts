/**
 * Single source of truth for tier definitions, Stripe price IDs, and tier-gate sets.
 *
 * Update this file when:
 *   - Stripe prices change (create new IDs in Stripe Dashboard, then update PRICE_IDS)
 *   - New tier introduced (add to Tier type, PRICE_IDS, PRICE_TO_TIER, and relevant tier set)
 *   - Tier renamed (legacy aliases preserved in TIER_ALIASES — do not delete)
 *
 * Imported by: stripe/checkout, stripe/webhook, twilio/voice, office-manager/list,
 *              invoices/add-past-due, quotes/add, crons/office-manager-daily,
 *              crons/review-requests, and the pricing page.
 *
 * Why this file exists: before May 2026 the Stripe price IDs lived in two route files
 * and the tier-gate sets lived in six. A new tier required edits in 8 places. Now: 1.
 */

export type Tier = 'receptionist' | 'officemgr' | 'concierge'
export type Interval = 'monthly' | 'annual'

// ── Stripe Price IDs (v7, May 12 2026) ──────────────────────────
// Created by scripts/create-v7-prices.mjs. To change: edit TIERS in that script,
// re-run, paste new IDs here. v6 ($179/$497/$997) prices archived in Stripe Dashboard.
export const PRICE_IDS: Record<Tier, { monthly: string; annual: string; setup: string }> = {
  receptionist: {
    monthly: 'price_1TWTwsGrkP7VQmUjYdnvv7ZU', // $397/mo
    annual:  'price_1TWTwsGrkP7VQmUjVH673Rny', // $3,960/yr (10 mo of monthly, 2 free)
    setup:   'price_1TWTwtGrkP7VQmUjYXR4nQnX', // $250 setup
  },
  officemgr: {
    monthly: 'price_1TWTwtGrkP7VQmUjKJ4Ka4MC', // $797/mo
    annual:  'price_1TWTwtGrkP7VQmUjLD42uJFA', // $7,940/yr
    setup:   'price_1TWTwuGrkP7VQmUjQ5ZzQzq2', // $500 setup
  },
  concierge: {
    monthly: 'price_1TWTwuGrkP7VQmUj6lxFwVvd', // $1,997/mo
    annual:  'price_1TWTwvGrkP7VQmUjdrMbU1KF', // $19,920/yr
    setup:   'price_1TWTwvGrkP7VQmUjwWZrApfx', // $1,000 setup
  },
}

// ── Reverse map: Stripe price ID → tier + call-cap ──────────────
// Used by the Stripe webhook to determine which tier a customer landed on after checkout.
// Keep `calls` as the soft cap (99999 = "unlimited" UX, no hard wall).
export const PRICE_TO_TIER: Record<string, { tier: Tier; calls: number }> = {
  // v7 active (May 12 2026)
  'price_1TWTwsGrkP7VQmUjYdnvv7ZU': { tier: 'receptionist', calls: 250 },
  'price_1TWTwsGrkP7VQmUjVH673Rny': { tier: 'receptionist', calls: 250 },
  'price_1TWTwtGrkP7VQmUjKJ4Ka4MC': { tier: 'officemgr',    calls: 99999 },
  'price_1TWTwtGrkP7VQmUjLD42uJFA': { tier: 'officemgr',    calls: 99999 },
  'price_1TWTwuGrkP7VQmUj6lxFwVvd': { tier: 'concierge',    calls: 99999 },
  'price_1TWTwvGrkP7VQmUjdrMbU1KF': { tier: 'concierge',    calls: 99999 },
  // v6 legacy (pre-May-12 customers — keep so their renewals/upgrades still match)
  'price_1TVLzIGrkP7VQmUjInufjfVe': { tier: 'receptionist', calls: 250 },
  'price_1TVLzIGrkP7VQmUjoV1TYYMd': { tier: 'receptionist', calls: 250 },
  'price_1TVXDFGrkP7VQmUjOVB3qgOh': { tier: 'officemgr',    calls: 99999 },
  'price_1TVXDFGrkP7VQmUjInUFNEni': { tier: 'officemgr',    calls: 99999 },
  'price_1TVXDGGrkP7VQmUjsBtcKsrE': { tier: 'concierge',    calls: 99999 },
  'price_1TVXDGGrkP7VQmUjbwIIv7qu': { tier: 'concierge',    calls: 99999 },
}

// ── Tier-gate sets ──────────────────────────────────────────────
// Include legacy aliases so customers on retired plan_tier strings still get gated correctly.
// 'foundation' = legacy v3 Receptionist (pre-May 2026)
// 'growth', 'premium', 'multiloc' = legacy/forward-compat Office Manager-tier names
export const RECEPTIONIST_TIERS = new Set<string>(['receptionist', 'foundation'])
export const OFFICE_MGR_TIERS   = new Set<string>(['officemgr', 'concierge', 'growth', 'premium'])
export const CONCIERGE_TIERS    = new Set<string>(['concierge'])
export const REVIEW_TIERS       = new Set<string>(['officemgr', 'concierge', 'growth', 'premium', 'multiloc'])

// Cap on calls received per month for Receptionist tier. Office Manager + Concierge unlimited.
export const RECEPTIONIST_CALL_CAP = 250

// ── Public tier metadata for /pricing page ──────────────────────
// Display values for the pricing UI. Decoupled from PRICE_IDS so the page can render
// without server access.
export const TIER_METADATA: Record<Tier, {
  name: string
  monthly: number
  annual: number   // shown per-month (annual_cents / 12 / 100), customer billed yearly
  setup: number
}> = {
  receptionist: { name: 'Receptionist',    monthly: 397,  annual: 330,  setup: 250  },
  officemgr:    { name: 'Office Manager',  monthly: 797,  annual: 662,  setup: 500  },
  concierge:    { name: 'Concierge',       monthly: 1997, annual: 1660, setup: 1000 },
}

// ── Helpers ─────────────────────────────────────────────────────
export function priceFor(tier: Tier, interval: Interval): string {
  return PRICE_IDS[tier][interval]
}

export function setupPriceFor(tier: Tier): string {
  return PRICE_IDS[tier].setup
}

export function isValidTier(t: string): t is Tier {
  return t === 'receptionist' || t === 'officemgr' || t === 'concierge'
}

export function tierForPriceId(priceId: string): Tier | undefined {
  return PRICE_TO_TIER[priceId]?.tier
}
