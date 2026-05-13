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

// ── Stripe Price IDs (v6, May 11 2026) ──────────────────────────
// Hardcoded because Vercel CLI env-var sync was unreliable. Code is the source of truth.
// To change a tier's price: create a new Price in Stripe Dashboard, paste its ID here,
// bump the date below.
export const PRICE_IDS: Record<Tier, { monthly: string; annual: string; setup: string }> = {
  receptionist: {
    monthly: 'price_1TVLzIGrkP7VQmUjInufjfVe', // $179/mo
    annual:  'price_1TVLzIGrkP7VQmUjoV1TYYMd', // $1,790/yr
    setup:   'price_1TVa1XGrkP7VQmUjC3kilwOR', // $50 setup
  },
  officemgr: {
    monthly: 'price_1TVXDFGrkP7VQmUjOVB3qgOh', // $497/mo
    annual:  'price_1TVXDFGrkP7VQmUjInUFNEni', // $4,970/yr
    setup:   'price_1TVa1YGrkP7VQmUjHQMyQvZS', // $247 setup
  },
  concierge: {
    monthly: 'price_1TVXDGGrkP7VQmUjsBtcKsrE', // $997/mo
    annual:  'price_1TVXDGGrkP7VQmUjbwIIv7qu', // $9,970/yr
    setup:   'price_1TVa1YGrkP7VQmUjg7AQL6Y2', // $497 setup
  },
}

// ── Reverse map: Stripe price ID → tier + call-cap ──────────────
// Used by the Stripe webhook to determine which tier a customer landed on after checkout.
// Keep `calls` as the soft cap (99999 = "unlimited" UX, no hard wall).
export const PRICE_TO_TIER: Record<string, { tier: Tier; calls: number }> = {
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
  annual: number   // shown per-month, customer is billed monthly * 10 (2 months free)
  setup: number
}> = {
  receptionist: { name: 'Receptionist',    monthly: 179, annual: 149, setup: 50  },
  officemgr:    { name: 'Office Manager',  monthly: 497, annual: 414, setup: 247 },
  concierge:    { name: 'Concierge',       monthly: 997, annual: 831, setup: 497 },
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
