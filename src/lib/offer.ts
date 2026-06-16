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
// 2026-06-16 PIVOT — "first month FREE, then $197/mo." Goal: 500 customers ×
// $197 = $1.18M ARR by May 12 2027. Free first month kills the "$497 for
// software I'm not sure works" wall. Month 1 = 40 leads free (30-day trial),
// then $197/mo.
export const PRICE_MONTHLY_USD = 197
export const PRICE_ANNUAL_USD = 1_970          // pay 10 months, get 12
export const PRICE_ANNUAL_SAVINGS_USD = 394    // 2 months free

/**
 * Per-lead price math — used in comparison tables ($X.XX/lead vs HomeAdvisor).
 * Recomputed from PRICE_MONTHLY_USD / LEADS_PER_MONTH so it cannot drift.
 */
export const PRICE_PER_LEAD_USD = Number((PRICE_MONTHLY_USD / LEADS_PER_MONTH).toFixed(2))
export const PRICE_PER_LEAD_LABEL = `$${PRICE_PER_LEAD_USD.toFixed(2)}/lead`

/**
 * Intro mechanic — FIRST MONTH FREE (30-day trial, card on file, auto-bills
 * $197 on day 31). No promo code needed; the trial IS the offer.
 */
export const FIRST_MONTH_FREE = true
export const INTRO_PRICE_USD = 0
export const INTRO_PROMO_CODE = ''             // no code — free trial, not a discount
export const INTRO_DISCOUNT_USD = 0
export const PRICE_PER_LEAD_INTRO_USD = 0      // month 1 is free — $0/lead

/**
 * Stripe price IDs.
 * ⚠️ 2026-06-16 — STRIPE_PRICE_ID_MONTHLY MUST be swapped to the new $197/mo
 * price (Peter creates it in Stripe). Until then this still points at the $497
 * price — but month 1 is a FREE trial so nobody is charged during the window.
 * Update this ID the moment the $197 Stripe price exists.
 */
export const STRIPE_PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_197_MONTHLY || 'price_1TgUZFGrkP7VQmUjw9c5gEXv'
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
// 2026-06-10 — re-opened electrical + handyman + Other per Peter. Recipe Lab
// validated electrical pre-1980 + handyman recent-buyer; "Other" routes to
// the handyman recent-buyer recipe inside find-real-leads.tradeFiltersFor.
export const SUPPORTED_TRADES = ['HVAC', 'plumbing', 'electrical', 'roofing', 'handyman'] as const
export const SUPPORTED_TRADES_SENTENCE = 'HVAC, plumbing, electrical, roofing, and handyman contractors'

/**
 * Served zip prefixes — RETIRED 2026-06-10.
 *
 * Original purpose: gate signups to metros where the shared permit-scraper
 * pool had been measured to sustain LEADS_PER_WEEK supply. Chicago + the
 * Northeast cluster were the only metros whose city scrapers had been
 * proven (docs/lead-supply-measurement-2026-06-09.md).
 *
 * Why retired: live BatchData probe 2026-06-10 (scripts/probe-batchdata-supply.ts)
 * returned 15/15 owner-occupied properties for HVAC recipe in Chicago,
 * Austin, AND Phoenix — three independent metros, including one where the
 * shared permit scraper was provably dead (Phoenix CKAN, see commit
 * 49f1f07 + scrape-permits-phoenix deletion). Per-tenant on-signup
 * fulfillment via find-real-leads → BatchData covers any US zip. The gate
 * was solving a problem the architecture no longer has.
 *
 * Set kept exported for back-compat callers but isZipServed() now returns
 * true for any valid 5-digit zip. Delete the constant once no consumer
 * imports it.
 */
export const SERVED_ZIP_PREFIXES = new Set<string>()

/**
 * Helper — is this 5-digit zip a US zip we can deliver to? Yes for any
 * valid 5-digit zip as of 2026-06-10 (see comment above).
 */
export function isZipServed(zip5: string): boolean {
  const z = (zip5 || '').slice(0, 5)
  return /^\d{5}$/.test(z)
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
export const META_TITLE = `${BRAND_NAME} — ${LEADS_PER_WEEK} Fresh Contractor Leads Every Week | HVAC, Plumbing, Electrical, Roofing, Handyman`
export const META_DESCRIPTION = `${LEADS_PER_WEEK} fresh leads in your service area, delivered every week. $${PRICE_MONTHLY_USD}/mo — first month $${INTRO_PRICE_USD}. Built for ${SUPPORTED_TRADES_SENTENCE}. Cancel anytime.`

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
