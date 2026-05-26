/**
 * Single source of truth for tier definitions, Stripe price IDs, and tier-gate sets.
 *
 * Update this file when:
 *   - Stripe prices change (create new IDs in Stripe Dashboard, then update PRICE_IDS_V2)
 *   - New tier introduced (add to Tier type, PRICE_IDS_V2, PRICE_TO_TIER, and relevant tier set)
 *   - Tier renamed (legacy aliases preserved in TIER_*_V1 — do not delete)
 *
 * Imported by: stripe/checkout, stripe/webhook, twilio/voice, office-manager/list,
 *              invoices/add-past-due, quotes/add, crons/office-manager-daily,
 *              crons/review-requests, and the pricing page.
 *
 * Why this file exists: before May 2026 the Stripe price IDs lived in two route files
 * and the tier-gate sets lived in six. A new tier required edits in 8 places. Now: 1.
 *
 * ─── v2 PRICING (May 23 2026) ───
 * Slugs are unchanged ('receptionist' / 'officemgr' / 'concierge') — only displayed
 * labels and prices changed. The slug-based gates and DB columns continue to work.
 *
 *   Mission Control ($397) → Starter ($147), 60 calls/mo cap
 *   Operator        ($797) → Pro     ($297), 300 calls/mo cap
 *   Concierge      ($1997) → Elite   ($597), UNLIMITED — waitlist-only until 3 Pro customers
 *
 * The PRICING_VERSION env var ('v1_legacy' | 'v2_new', default v2_new) controls
 * which display + price ID set the pricing page advertises. Both sets of price IDs
 * resolve correctly in the Stripe webhook regardless of which version is active,
 * so legacy customers keep working.
 *
 * Rollback: set PRICING_VERSION=v1_legacy in Vercel + redeploy + re-run
 * scripts/bake-sales-prompt-into-assistant.mjs. See docs/pricing-rollback.md.
 */

export type Tier = 'receptionist' | 'officemgr' | 'concierge'
export type Interval = 'monthly' | 'annual'
export type PricingVersion = 'v1_legacy' | 'v2_new'

// Default to v2 unless explicitly set to v1_legacy. Read once at module load
// so the constant is stable for the lifetime of the serverless function.
export const CURRENT_PRICING_VERSION: PricingVersion =
  (process.env.PRICING_VERSION as PricingVersion) === 'v1_legacy' ? 'v1_legacy' : 'v2_new'

// ── Stripe Price IDs — v1 (legacy, May 12 2026, $397/$797/$1997) ──
// Created by scripts/create-v7-prices.mjs. Preserved verbatim for rollback safety
// and so grandfathered customers on these prices continue to renew at their original
// price point. NEVER delete these IDs from PRICE_TO_TIER below.
export const PRICE_IDS_V1: Record<Tier, { monthly: string; annual: string; setup: string }> = {
  receptionist: {
    monthly: 'price_1TWTwsGrkP7VQmUjYdnvv7ZU', // $397/mo
    annual:  'price_1TWTwsGrkP7VQmUjVH673Rny', // $3,960/yr (10 mo of monthly, 2 free)
    setup:   'price_1TWTwtGrkP7VQmUjYXR4nQnX', // $250 setup (currently $0 in checkout, ID retained for backward compat)
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

// ── Stripe Price IDs — v2 (May 23 2026, $147/$297/$597 — Starter/Pro/Elite) ──
// Created via Stripe API on 2026-05-23 against the existing product IDs:
//   Receptionist product: prod_UVUw8kOSSqciIr
//   OfficeMgr    product: prod_UVUwulTFFELqnk
//   Concierge    product: prod_UVUwZwbvhdpRwR
// All v2 prices have metadata.version='v8' and lookup_keys like
// 'bellavego-{tier}-v8-{interval}'. No setup fees (founding-partner pricing).
export const PRICE_IDS_V2: Record<Tier, { monthly: string; annual: string; setup: string }> = {
  receptionist: {
    monthly: 'price_1TaJOcGrkP7VQmUj8qSiEx2b', // $147/mo Starter
    annual:  'price_1TaJOcGrkP7VQmUj4AMGChWp', // $1,460/yr Starter (~17% off)
    setup:   '', // no setup fee in v2 — empty string sentinel; checkout skips line if empty
  },
  officemgr: {
    monthly: 'price_1TaJOdGrkP7VQmUjVLsHnueB', // $297/mo Pro
    annual:  'price_1TaJOdGrkP7VQmUjwJuIdiKA', // $2,970/yr Pro (~17% off)
    setup:   '',
  },
  concierge: {
    monthly: 'price_1TaJOdGrkP7VQmUjrLltX596', // $597/mo Elite
    annual:  'price_1TaJOdGrkP7VQmUja2CDmocA', // $5,970/yr Elite (~17% off)
    setup:   '',
  },
}

// Active price IDs based on PRICING_VERSION env. Pricing page + checkout read from here.
export const PRICE_IDS: Record<Tier, { monthly: string; annual: string; setup: string }> =
  CURRENT_PRICING_VERSION === 'v1_legacy' ? PRICE_IDS_V1 : PRICE_IDS_V2

// ── Reverse map: Stripe price ID → tier + call-cap ──────────────
// MUST include both v1 AND v2 prices so the Stripe webhook resolves any
// customer (legacy or new) to the right tier. Existing customers on v1 prices
// stay on v1 calls cap (250 for receptionist). New v2 customers get unlimited.
export const PRICE_TO_TIER: Record<string, { tier: Tier; calls: number }> = {
  // v2 active (May 23 2026 — Starter $147 / Pro $297 / Elite $597)
  'price_1TaJOcGrkP7VQmUj8qSiEx2b': { tier: 'receptionist', calls: 60 },    // Starter monthly — 60/mo cap (forces upgrade to Pro)
  'price_1TaJOcGrkP7VQmUj4AMGChWp': { tier: 'receptionist', calls: 60 },    // Starter annual  — 60/mo cap
  'price_1TaJOdGrkP7VQmUjVLsHnueB': { tier: 'officemgr',    calls: 300 },   // Pro monthly — 300/mo cap (Elite for unlimited)
  'price_1TaJOdGrkP7VQmUjwJuIdiKA': { tier: 'officemgr',    calls: 300 },   // Pro annual  — 300/mo cap
  'price_1TaJOdGrkP7VQmUjrLltX596': { tier: 'concierge',    calls: 99999 }, // Elite monthly — UNLIMITED
  'price_1TaJOdGrkP7VQmUja2CDmocA': { tier: 'concierge',    calls: 99999 }, // Elite annual  — UNLIMITED
  // v1 legacy (May 12 2026 — $397/$797/$1997)
  'price_1TWTwsGrkP7VQmUjYdnvv7ZU': { tier: 'receptionist', calls: 250 },   // Mission Control monthly — CAPPED
  'price_1TWTwsGrkP7VQmUjVH673Rny': { tier: 'receptionist', calls: 250 },   // Mission Control annual  — CAPPED
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

// Legacy cap export — preserved because /api/twilio/sms still imports it.
// New code should read from TIER_CALL_CAP below for per-tier accuracy.
export const RECEPTIONIST_CALL_CAP: number =
  CURRENT_PRICING_VERSION === 'v1_legacy' ? 250 : 60

// Per-tier monthly call cap keyed by plan_tier slug. Single source of truth
// for runtime enforcement in /api/twilio/voice and /api/vapi/assistant-request.
// Infinity = no cap. Legacy slugs preserved at their original marketed caps
// so grandfathered customers don't get downgraded.
export const TIER_CALL_CAP: Record<string, number> = {
  // v2 active (May 23 2026)
  receptionist: CURRENT_PRICING_VERSION === 'v1_legacy' ? 250 : 60, // Starter $147
  officemgr:    300,                                                 // Pro $297
  concierge:    Number.POSITIVE_INFINITY,                            // Elite $597
  // Legacy plan_tier strings — keep generous for grandfathered customers.
  foundation:   Number.POSITIVE_INFINITY, // legacy $79 unlimited
  growth:       Number.POSITIVE_INFINITY, // legacy $179 unlimited
  premium:      Number.POSITIVE_INFINITY, // legacy $499 unlimited
  multiloc:     Number.POSITIVE_INFINITY, // legacy custom
  solo:         150,  // legacy v3 receptionist 150-call tier
  scale:        1500, // legacy v3 office-mgr 1500-call tier
  starter:      200,  // legacy v0 $49 starter
}

// ── Public tier metadata for /pricing page + dashboard + emails ──
// Two metadata sets — TIER_METADATA_V1 (legacy display) and TIER_METADATA_V2
// (current display). TIER_METADATA aliases to the active set based on env.
//
// `monthly` and `annual` are MARKETED prices (USD), where `annual` is the
// per-month equivalent of the yearly plan (annual_total_cents / 12 / 100).
// `setup` is the one-time setup fee in USD ($0 in both v1 and v2 — see comment
// on PRICE_IDS_V1.receptionist.setup for re-enablement instructions).

export const TIER_METADATA_V1: Record<Tier, {
  name: string
  monthly: number
  annual: number
  setup: number
}> = {
  receptionist: { name: 'Mission Control', monthly: 397,  annual: 330,  setup: 0 },
  officemgr:    { name: 'Operator',        monthly: 797,  annual: 662,  setup: 0 },
  concierge:    { name: 'Concierge',       monthly: 1997, annual: 1660, setup: 0 },
}

export const TIER_METADATA_V2: Record<Tier, {
  name: string
  monthly: number
  annual: number
  setup: number
}> = {
  receptionist: { name: 'Starter', monthly: 147, annual: 122, setup: 0 }, // $1,460/yr ÷ 12 = $121.67
  officemgr:    { name: 'Pro',     monthly: 297, annual: 248, setup: 0 }, // $2,970/yr ÷ 12 = $247.50
  concierge:    { name: 'Elite',   monthly: 597, annual: 498, setup: 0 }, // $5,970/yr ÷ 12 = $497.50
}

export const TIER_METADATA: Record<Tier, {
  name: string
  monthly: number
  annual: number
  setup: number
}> = CURRENT_PRICING_VERSION === 'v1_legacy' ? TIER_METADATA_V1 : TIER_METADATA_V2

// ── Canonical tier features — single source of truth ──
//
// EVERY pricing surface across the site (landing page, /pricing, dashboard
// upgrade flow, sales decks) imports from this constant. If you change a
// feature description here, it auto-updates EVERYWHERE — no copy drift.
//
// Each tier has:
//   - tagline:   one-line value prop shown on the card
//   - callCap:   short call cap label
//   - reportsCadence: short consulting-report cadence label
//   - features:  full bulleted feature list (long-form for /pricing + /)
//   - highlights: 5-7 compressed bullets (for dashboard upgrade cards)
//   - comingSoon: true means waitlist-only (Elite right now)
export type TierFeatures = {
  tagline: string
  callCap: string
  reportsCadence: string
  features: string[]
  highlights: string[]
  comingSoon: boolean
}

export const TIER_FEATURES: Record<Tier, TierFeatures> = {
  receptionist: {
    tagline: 'AI answers every call. You close it in one tap.',
    callCap: '60 calls/mo',
    reportsCadence: '6 AI Consulting Reports/yr (bi-monthly)',
    comingSoon: false,
    highlights: [
      '24/7 AI receptionist in your business name',
      '60 calls/month included',
      'Lead lands on your phone within 10 seconds — push + email',
      'Auto-books appointments to Google, Outlook, or Calendly',
      'Emergency outbound voice call to your cell',
      '6 AI revenue reports/year',
    ],
    features: [
      '24/7 AI receptionist — picks up in your business name, captures every lead',
      '60 calls per month included (approximately 2 per day)',
      'Lead lands on your phone within 10 seconds after the call — push notification + email with caller, problem, tap-to-call link',
      'Auto-books appointments to your Google Calendar, Outlook, or Calendly (you toggle on/off)',
      'Emergency outbound voice call to your cell when caller flags urgency',
      '6 AI revenue reports per year — bi-monthly, shows missed jobs, top services, what to fix',
      'No contract · 7-day free trial · cancel anytime',
    ],
  },
  officemgr: {
    tagline: 'Five AIs running your back office while you turn wrenches.',
    callCap: '300 calls/mo',
    reportsCadence: '12 AI Consulting Reports/yr (monthly)',
    comingSoon: false,
    highlights: [
      'Everything in Starter, plus:',
      '300 calls/month included',
      'AI Quote Hunter — auto follow-up day 2, 7, 14',
      'AI Collections — pay-by-text on past-due invoices',
      'AI Reputation — auto-asks customers for Google reviews',
      'Smart sales-tip insight on every lead alert',
      '12 monthly AI revenue reports',
    ],
    features: [
      'Everything in Starter, plus:',
      '300 calls per month included (approximately 10 per day — multi-truck operations)',
      'AI Quote Hunter — auto-follows up on every open quote on day 2, 7, and 14',
      'AI Collections — chases past-due invoices with auto-generated pay-by-text Stripe links',
      'AI Reputation — auto-asks happy customers for Google reviews after job completion',
      'Smart insight on every lead alert — Claude reads the call and texts you a sales tip',
      '12 AI revenue reports per year — monthly, with sales coaching from your actual call transcripts',
      '24-hour priority email support',
    ],
  },
  concierge: {
    tagline: 'AI runs your back office AND your marketing. You just close the work.',
    callCap: 'Unlimited calls',
    reportsCadence: '24 bi-weekly reports + 4 quarterly McKinsey deep-dives',
    comingSoon: true,
    highlights: [
      'Everything in Pro, plus:',
      'Unlimited inbound calls',
      'AI Ad Creative Generator — Google + Meta copy weekly',
      'AI Lead Sourcing — permits + storm alerts → outbound SMS',
      'AI Job-Site Photo Studio — text a photo, get social posts',
      'AI Competitor Watcher — weekly intel on 5 local competitors',
      'AI Local SEO — weekly blog posts auto-published',
      '4-hour SLA + direct founder access',
    ],
    features: [
      'Everything in Pro, plus:',
      'Unlimited inbound calls — no monthly cap',
      'AI Ad Creative Generator — Google + Meta ad copy written weekly from your call transcripts (the ads use YOUR customers\' actual words)',
      'AI Lead Sourcing — pulls fresh building permits + severe-weather alerts, texts the homeowner FOR you',
      'AI Job-Site Photo Studio — text a finished-job photo, AI generates Instagram + Facebook + Google Business posts with caption, hashtags, and one-tap review request to the customer',
      'AI Competitor Watcher — weekly intel on 5 local competitors\' pricing, reviews, and ad spend',
      'AI Local SEO — weekly blog posts auto-published to your site, optimized for "[trade] near me" searches',
      '24 bi-weekly reports + 4 quarterly McKinsey-style deep-dives',
      '4-hour priority SLA + direct founder text/call access',
    ],
  },
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

/**
 * Monthly inbound call cap for a given plan_tier slug.
 *
 * Returns the v2 caps: Starter 60 / Pro 300 / Elite unlimited (999999).
 *
 * For legacy plan_tier values (foundation, growth, premium, multiloc),
 * inherits the v2 cap of their effective tier set so grandfathered
 * customers don't get punished by lower caps than current marketing.
 *
 * Used by /api/vapi/end-of-call-report to detect when a contractor has
 * crossed their monthly cap and needs their assistant swapped into
 * capacity mode. See sql/2026-05-24-capacity-mode-tracking.sql.
 */
export function callCapForTier(planTier: string | null | undefined): number {
  const t = (planTier || '').toLowerCase()
  const cap = TIER_CALL_CAP[t]
  if (cap === undefined) return 999999 // Unknown tier — permissive default.
  return Number.isFinite(cap) ? cap : 999999
}

/**
 * Display name for a tier slug, version-aware.
 *   v1 → 'Mission Control' | 'Operator' | 'Concierge'
 *   v2 → 'Starter'         | 'Pro'      | 'Elite'
 * Pass an explicit `version` to force a specific display (useful for admin
 * UIs that need to show both names side by side).
 */
export function displayTierName(slug: Tier, version: PricingVersion = CURRENT_PRICING_VERSION): string {
  return (version === 'v1_legacy' ? TIER_METADATA_V1 : TIER_METADATA_V2)[slug].name
}

/**
 * Resolve a Stripe price ID to its marketed display info. Use this in dashboard
 * UIs that show a customer's current plan — looks at the price they actually
 * paid on, not the env flag. So a v1 customer paying $397 always sees
 * "Mission Control · $397/mo" even after PRICING_VERSION flips to v2_new.
 */
export function displayInfoForPriceId(priceId: string): {
  tier: Tier
  name: string
  monthly: number
  isLegacy: boolean
} | undefined {
  const mapped = PRICE_TO_TIER[priceId]
  if (!mapped) return undefined
  // v1 price IDs are the ones in PRICE_IDS_V1 (any field)
  const v1Ids = new Set<string>([
    ...Object.values(PRICE_IDS_V1).flatMap((t) => [t.monthly, t.annual]),
  ])
  const isLegacy = v1Ids.has(priceId)
  const meta = isLegacy ? TIER_METADATA_V1[mapped.tier] : TIER_METADATA_V2[mapped.tier]
  return { tier: mapped.tier, name: meta.name, monthly: meta.monthly, isLegacy }
}
