/**
 * Single source of truth for the BellAveGo offer.
 *
 * EVERY page, meta tag, email template, marketing surface, AND the lead
 * engine itself imports from this file. Do NOT hardcode prices or lead
 * counts elsewhere — they will drift.
 *
 * Last updated 2026-06-09 in the leads-only pivot.
 */

/**
 * LEADS_PER_WEEK
 *
 * PETER: CONFIRM BEFORE DEPLOY
 *
 * Data measured 2026-06-09 (see docs/lead-supply-measurement-2026-06-09.md)
 * shows current scraper output reliably sustains 5 leads/week per customer
 * at single-customer-per-zip density. Phoenix scraper is at 0/wk (broken).
 * To raise this to 10/wk you need:
 *   (a) Phoenix scraper diagnostic + fix
 *   (b) 2-3x permit scraper expansion across Sun Belt
 *   (c) handyman + electrical scrape sources unlocked
 *
 * The lead engine (lib/leadEngine.ts) reads this value. The marketing site
 * reads this value. Bump it ONLY when the supply measurement supports it.
 */
export const LEADS_PER_WEEK = 5
export const LEADS_PER_MONTH = LEADS_PER_WEEK * 4 // marketing convenience

/**
 * Pricing — single tier active for new signups.
 * Legacy tier slugs (receptionist/concierge) preserved internally for
 * grandfathered subscribers ONLY. Customer-facing surfaces use Pro.
 */
export const PRICE_MONTHLY_USD = 497
export const PRICE_ANNUAL_USD = 4_997
export const PRICE_ANNUAL_SAVINGS_USD = 968

/**
 * Intro discount mechanic — REAL.
 * FIRST400 is a Stripe promotion_code that applies $400 off the first
 * month, taking $497 → $97 on month 1.
 */
export const INTRO_PRICE_USD = 97
export const INTRO_PROMO_CODE = 'FIRST400'
export const INTRO_DISCOUNT_USD = 400

/**
 * Stripe price IDs — v9 leads-only.
 * Mirror of lib/pricing.ts PRICE_IDS_V2.officemgr. Re-exported here so
 * marketing components don't need to import the legacy tier-keyed object.
 */
export const STRIPE_PRICE_ID_MONTHLY = 'price_1TgUZFGrkP7VQmUjw9c5gEXv'
export const STRIPE_PRICE_ID_ANNUAL = 'price_1TgUanGrkP7VQmUjujaifNI0'

/**
 * Trades the product is honestly built for.
 * Data 2026-06-09: handyman + electrical inventory is near zero. Leaving
 * them in the supported trade list is dishonest unless the scrape pipeline
 * is unlocked. Update when supply changes.
 */
export const SUPPORTED_TRADES = ['HVAC', 'plumbing', 'electrical'] as const
export const SUPPORTED_TRADES_SENTENCE = 'HVAC, plumbing, and electrical contractors'

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
export const META_TITLE = `${BRAND_NAME} — ${LEADS_PER_WEEK} Fresh Contractor Leads Every Week | HVAC, Plumbing, Electrical`
export const META_DESCRIPTION = `${LEADS_PER_WEEK} fresh leads in your service area, delivered every week. $${PRICE_MONTHLY_USD}/mo — first month $${INTRO_PRICE_USD}. Built for HVAC, plumbing, and electrical contractors. Cancel anytime.`

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
  'county data on aging systems',
] as const

export const LEAD_FIELDS_HUMAN = [
  'homeowner name',
  'street address',
  'verified phone (skip-traced)',
  'property year built + estimated value',
  'why this lead surfaced (the signal that triggered it)',
  'AI-written outreach script (SMS + email + call opener)',
] as const
