/**
 * Single source of truth for the BellAveGo offer.
 *
 * EVERY page, meta tag, email template, marketing surface, AND the lead
 * engine itself imports from this file. Do NOT hardcode prices or lead
 * counts elsewhere — they will drift.
 *
 * Last updated 2026-06-10 — leads-only pivot.
 *
 * FOUNDER-ONLY EDITS to LEADS_PER_WEEK, PRICE_MONTHLY_USD, INTRO_PRICE_USD,
 * GUARANTEE_*, and SUPPORTED_TRADES. These are offer commitments — changing
 * them silently in a side commit broke supply-floor planning on 2026-06-10
 * when LEADS_PER_WEEK was bumped 5 → 10 by a parallel agent without
 * recomputing per-metro customer ceilings. Any agent reading this: do not
 * modify these constants without explicit founder approval in the message
 * that opened the task.
 */

/**
 * LEADS_PER_WEEK
 *
 * Locked at 10 on 2026-06-10 by Peter. The marketing offer is
 * "10 fresh leads / week (40 / month)" — also makes the $12.43/lead
 * anchor (497 / 40) arithmetically consistent.
 *
 * Supply reality as of 2026-06-10 (scripts/supply-floor-per-metro.ts):
 *   Chicago: 232 real-source qualified/wk → 11 customer slots @ 10×2 headroom
 *   Austin:   68 real-source qualified/wk →  3 slots (BELOW 5-customer floor)
 *   Orlando:   0 (GeoJSON fix shipped 49f1f07; ~110/wk forecast post-deploy)
 *
 * Synthetic aging_hvac source PURGED on 2026-06-10 — 27,479 placeholder
 * rows deleted from leads table. Real-source pool is 1,943 rows total.
 *
 * The 1-Job Guarantee absorbs supply gap for early customers; outstanding
 * to make 10/wk mechanically real long-term: Sun Belt scrape coverage +
 * cron firing on schedule (telemetry shipped 45ded2d, awaiting 48h data).
 *
 * The lead engine (lib/leadEngine.ts) reads this value. The marketing site
 * reads this value. Per-lead price math + every customer surface derives
 * from here — never hardcode a count elsewhere.
 */
export const LEADS_PER_WEEK = 10
export const LEADS_PER_MONTH = LEADS_PER_WEEK * 4 // marketing convenience

/**
 * Derived strings — import these so the number is impossible to drift.
 * Anytime LEADS_PER_WEEK changes, every surface updates automatically.
 *
 * Keep this list LEAN — only add a label when it's used on 2+ surfaces.
 */
export const LEADS_PER_WEEK_LABEL = `${LEADS_PER_WEEK} fresh homeowner leads / week`
export const LEADS_PER_MONTH_LABEL = `${LEADS_PER_MONTH} fresh homeowner leads / month`
export const LEADS_CADENCE_SHORT = `${LEADS_PER_WEEK} leads every Monday`
export const LEADS_PER_MONTH_HEADLINE = `${LEADS_PER_MONTH} fresh leads`

/**
 * Pricing — single tier active for new signups.
 * Legacy tier slugs (receptionist/concierge) preserved internally for
 * grandfathered subscribers ONLY. Customer-facing surfaces use Pro.
 */
export const PRICE_MONTHLY_USD = 497
export const PRICE_ANNUAL_USD = 4_997
export const PRICE_ANNUAL_SAVINGS_USD = 968

/**
 * Per-lead price math — used in comparison tables ($X.XX/lead vs HomeAdvisor).
 * Recomputed from PRICE_MONTHLY_USD / LEADS_PER_MONTH so it cannot drift.
 */
export const PRICE_PER_LEAD_USD = Number((PRICE_MONTHLY_USD / LEADS_PER_MONTH).toFixed(2))
export const PRICE_PER_LEAD_LABEL = `$${PRICE_PER_LEAD_USD.toFixed(2)}/lead`

/**
 * Intro discount mechanic — REAL.
 * FIRST400 is a Stripe promotion_code that applies $400 off the first
 * month, taking $497 → $97 on month 1.
 */
export const INTRO_PRICE_USD = 97
export const INTRO_PROMO_CODE = 'FIRST400'
export const INTRO_DISCOUNT_USD = 400
export const PRICE_PER_LEAD_INTRO_USD = Number((INTRO_PRICE_USD / LEADS_PER_MONTH).toFixed(2))

/**
 * Stripe price IDs — v9 leads-only.
 * Mirror of lib/pricing.ts PRICE_IDS_V2.officemgr. Re-exported here so
 * marketing components don't need to import the legacy tier-keyed object.
 */
export const STRIPE_PRICE_ID_MONTHLY = 'price_1TgUZFGrkP7VQmUjw9c5gEXv'
export const STRIPE_PRICE_ID_ANNUAL = 'price_1TgUanGrkP7VQmUjujaifNI0'

/**
 * Trades the product is honestly built for.
 *
 * 2026-06-10 — handyman + electrical DROPPED from new signups per the
 * supply doc (73 electrical + 77 handyman leads across 6 weeks across
 * ALL metros — effectively zero). Listing them = overselling = refunds.
 * Roofing kept because supply doc shows 838 across 6 weeks. Re-add a
 * trade once scrape coverage clears the per-week minimum.
 */
export const SUPPORTED_TRADES = ['HVAC', 'plumbing', 'roofing'] as const
export const SUPPORTED_TRADES_SENTENCE = 'HVAC, plumbing, and roofing contractors'

/**
 * Served zip prefixes — T3 honesty gate.
 *
 * Only zips whose 3-character prefix is in this set can claim a
 * territory. Everything else routes to the "we're not in your area yet,
 * join waitlist" flow.
 *
 * Source: docs/lead-supply-measurement-2026-06-09.md.
 * Currently:
 *   - Chicago: 606xx, 605xx
 *   - Northeast cluster: 010xx-034xx (Boston, Hartford, Providence, etc.)
 *
 * NOT served until scrapers fixed:
 *   - 850-853 (Phoenix) — 0 qualified leads in 42 days
 *   - Dallas, Austin, Atlanta, Orlando, Miami, Nashville, Houston metros
 *   - All Sun Belt cities besides Chicago
 *
 * Expand once the per-metro supply doc proves >= LEADS_PER_WEEK * 5
 * sustained over 4 weeks.
 */
export const SERVED_ZIP_PREFIXES = new Set<string>([
  '606', '605',  // Chicago metro
  '010', '011', '012', '013', '014', '015', '016', '017', '018', '019',  // MA west
  '020', '021', '022', '023', '024', '025', '026', '027',  // MA east + RI
  '028', '029',  // RI + MA south
  '030', '031', '032', '033', '034',  // NH + ME
])

/**
 * Helper — is this 5-digit zip in a metro we can actually deliver to?
 */
export function isZipServed(zip5: string): boolean {
  const z = (zip5 || '').slice(0, 5)
  if (!/^\d{5}$/.test(z)) return false
  return SERVED_ZIP_PREFIXES.has(z.slice(0, 3))
}

/**
 * Guarantee — pull through to every marketing surface.
 *
 * 2026-06-09 — CAPPED to fix the unbounded-free-period legal/financial
 * bug. Old copy said "next 30 days free UNTIL you book a job" which
 * created an open-ended liability. New language caps the comp at ONE
 * additional month, full stop.
 *
 * If you change the guarantee terms, change THESE lines — not the copy
 * on each page. Every customer surface imports from here.
 */
export const GUARANTEE_LABEL = 'The 1-Job Guarantee'
export const GUARANTEE_SHORT = 'The 1-Job Guarantee: book a paying job in 30 days, or full refund + your next month free + you keep every lead.'
export const GUARANTEE_HEADLINE = 'Book a paying job in 30 days or full refund + your next month free'

/**
 * Brand + contact.
 */
export const BRAND_NAME = 'BellAveGo'
export const FOUNDER_PHONE = '(773) 710-9565'
export const FOUNDER_PHONE_HREF = 'tel:+17737109565'
export const SITE_URL = 'https://www.bellavego.com'

/**
 * Unified meta description — used by metadata, OG, and Twitter.
 * KEEP IDENTICAL across all three per the brief.
 */
export const META_TITLE = `${BRAND_NAME} — ${LEADS_PER_WEEK} Fresh Contractor Leads Every Week | HVAC, Plumbing, Roofing`
export const META_DESCRIPTION = `${LEADS_PER_WEEK} fresh leads in your service area, delivered every week. $${PRICE_MONTHLY_USD}/mo — first month $${INTRO_PRICE_USD}. Built for HVAC, plumbing, and roofing contractors. Cancel anytime.`

/**
 * Honest data-source description — for the homepage "what you get Monday"
 * section. Pulled from the real lead pipeline (BatchData + permit scrapers
 * + NOAA storms + MLS move-ins). NOT a list of features the product doesn't
 * have. If you add a source, update this string.
 */
export const LEAD_SOURCES_HUMAN = [
  'building permits filed at city hall',
  'NOAA-verified storm strikes in your zip',
  'MLS new-homeowner records',
  // 2026-06-10 dropped "county data on aging systems" — that source was
  // the synthetic aging_hvac generator (one placeholder row per US zip,
  // no real homeowner). Purged from leads table same day. Do not re-add
  // without a real BatchData-backed property feed.
] as const

export const LEAD_FIELDS_HUMAN = [
  'homeowner name',
  'street address',
  'verified phone (skip-traced)',
  'property year built + estimated value',
  'why this lead surfaced (the signal that triggered it)',
  'AI-written outreach script (SMS + email + call opener)',
] as const
