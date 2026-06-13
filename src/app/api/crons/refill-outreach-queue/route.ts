import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { verifyEmail } from '@/lib/verifyEmail'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/refill-outreach-queue
 *
 * Nightly autopilot for the cold-email pipeline. Replaces the manual
 * `scripts/scrape-next-batch.mjs` run.
 *
 * What it does (cron schedule: 0 6 * * * — 2am ET / 1am CT):
 *   1. Reads data/scrape-schedule.json for tomorrow's target cities
 *   2. Calls Apify Google Maps Scraper for each city (small dogs ICP)
 *   3. Calls Apify Contact Info Scraper for email addresses
 *   4. Inserts new rows into outreach_leads w/ status='queued'
 *   5. UNIQUE(email) constraint dedups against every prospect ever queued
 *
 * Then `/api/crons/auto-load-instantly` (runs every 12hrs) takes those
 * queued rows and pushes them to the Instantly campaign automatically.
 *
 * Goal: never miss a Mon-Sat sending day from now through Sep 1 2026.
 *
 * Algorithm Step 5 (Automate) — only after the manual scrape pipeline
 * was proven working end-to-end (June 8 2026 — first 119 sent live).
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY
const APIFY_MAPS_ACTOR = 'compass~crawler-google-places'
const APIFY_CONTACT_ACTOR = 'vdrmota~contact-info-scraper'

const SCHEDULE_PATH = path.join(process.cwd(), 'data', 'scrape-schedule.json')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type ScheduleDay = {
  date: string
  send_target: number
  scrape_target: number
  cities: string[]
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadSchedule(targetDate: string): ScheduleDay | null {
  if (!fs.existsSync(SCHEDULE_PATH)) return null
  const raw = JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'))
  return (raw.schedule || []).find((d: ScheduleDay) => d.date === targetDate) || null
}

async function apifyRunSync<T>(actor: string, input: object, timeoutMs = 240_000): Promise<T[]> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${Math.floor(timeoutMs / 1000)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!r.ok) throw new Error(`Apify ${actor} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()) as T[]
}

type MapsItem = {
  title?: string
  website?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  categoryName?: string
  reviewsCount?: number
  // signals used for 1-3 person crew filter
  totalScore?: number
  permanentlyClosed?: boolean
  openingHours?: unknown
  imageUrls?: string[]
  additionalInfo?: Record<string, unknown>
}

// vdrmota~contact-info-scraper output shape: the page URL lives in
// `domain` / `originalStartUrl` / `scrapedUrls` — there is NO `url` field.
// Reading `it.url` (the old code) was always undefined, so every result
// got dropped and refill inserted 0 emails. Verified live 2026-06-12.
type ContactItem = {
  domain?: string
  originalStartUrl?: string
  scrapedUrls?: string[]
  emails?: string[]
}

// 2026-06-13 — defaults realigned to the trades the enforcement algorithm
// actually surfaces. Chicago South Side + Brooklyn HPD = MASONRY +
// ROOFING + HANDYMAN heavy (old brick rowhouses + façade violations +
// general deferred-maintenance). HVAC + plumbing + electrical were the
// old default and produced 0 inserts on the first run because none of
// the top zips are HVAC-density.
//
// Use ?trades= query param to override (e.g. ?trades=hvac,electrical for
// a focused HVAC-only run).
const DEFAULT_TRADE_KEYWORDS = ['masonry', 'roofing', 'handyman']

function classifyTrade(category?: string): string | null {
  const c = (category || '').toLowerCase()
  if (/hvac|air condition|heating|cooling/.test(c)) return 'HVAC'
  if (/plumb/.test(c)) return 'Plumbing'
  if (/electric/.test(c)) return 'Electrical'
  if (/roof/.test(c)) return 'Roofing'
  // 2026-06-13 — masonry + handyman support added per Peter's enforcement
  // pivot. Brick/façade violation supply dwarfs HVAC in Brooklyn + Chicago.
  if (/mason|brick|stone|tuck.?point|stucco|chimney/.test(c)) return 'Masonry'
  if (/handyman|general contractor|repair|maintenance|renovat|remodel/.test(c)) return 'Handyman'
  if (/paint/.test(c)) return 'Painting'
  return null
}

// 2026-06-08 tighter ICP — Peter's "team of 1-3 looking for couple extra
// jobs a week + receptionist so they never answer the phone." Drop
// anything that smells like an established crew of 5+:
//   - reviewsCount > 40 (over 40 reviews ≈ 5+ years operating, multi-truck)
//   - title contains "& Sons", "Brothers", "Plumbing Co", "HVAC Inc" (multi-tech vibe)
//   - imageUrls > 12 (heavy marketing budget = not solo)
//   - openingHours 24/7 (24/7 dispatch = staffed team)
function passesSoloOrSmallCrewFilter(m: MapsItem): boolean {
  if (!m.website || m.permanentlyClosed) return false
  const reviews = m.reviewsCount ?? 0
  if (reviews > 40) return false  // too established for 1-3 person crew
  const title = (m.title || '').toLowerCase()
  if (/&\s+sons|brothers|family/.test(title)) return false  // multi-tech signals
  if (/\b(company|co\.|inc\.?|corp\.?|group|services llc)\b/.test(title)) {
    // could go either way — keep only if reviews ≤20 (newer/smaller)
    if (reviews > 20) return false
  }
  if ((m.imageUrls?.length ?? 0) > 12) return false  // marketing-heavy
  return true
}

async function scrapeCity(city: string, targetCount: number, tradeKeywords: string[]): Promise<MapsItem[]> {
  console.log(`[refill] scraping ${city} for ${targetCount} solo/1-3 person crew shops across ${tradeKeywords.length} trades`)
  // 2026-06-09 — Apify actor itself times out at scale. Cap at 25 places
  // per trade keyword × 3 keywords = 75 raw places per call. Fits in 4 min.
  const items = await apifyRunSync<MapsItem>(APIFY_MAPS_ACTOR, {
    searchStringsArray: tradeKeywords.map((kw) => `${kw} ${city}`),
    maxCrawledPlacesPerSearch: Math.min(25, Math.ceil(targetCount / tradeKeywords.length)),
    language: 'en',
    countryCode: 'us',
    skipClosedPlaces: true,
    onlyDataFromSearchPage: true,  // faster — no deep page crawl
    includeWebResults: false,
  }, 240_000)  // 4 min cap on maps actor (leaves 1 min for enrichment + insert)
  const filtered = items.filter(passesSoloOrSmallCrewFilter)
  console.log(`[refill] ${city}: ${items.length} raw → ${filtered.length} pass 1-3 person crew filter`)
  return filtered
}

/**
 * Normalize any URL to its bare hostname ("https://www.acme.com/contact"
 * → "acme.com"). The contact actor reports the PAGE it found each email
 * on (often /contact or /about), not the start URL — exact-URL matching
 * therefore returned 0 emails for every place (2026-06-12: 23/23 places
 * dropped). Keying both sides by domain fixes the join.
 */
function hostOf(u: string): string | null {
  try {
    return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

async function enrichEmails(websites: string[]): Promise<Map<string, string>> {
  if (websites.length === 0) return new Map()
  console.log(`[refill] enriching ${websites.length} websites for emails`)
  const items = await apifyRunSync<ContactItem>(APIFY_CONTACT_ACTOR, {
    startUrls: websites.map((u) => ({ url: u })),
    maxRequestsPerStartUrl: 3,
  }, 180_000)
  const out = new Map<string, string>()
  for (const it of items) {
    if (!it.emails || it.emails.length === 0) continue
    const host = hostOf(it.domain || it.originalStartUrl || it.scrapedUrls?.[0] || '')
    if (!host || out.has(host)) continue
    const valid = it.emails.find((e) => !/noreply|no-reply|abuse|postmaster/i.test(e))
    if (valid) out.set(host, valid.toLowerCase())
  }
  return out
}

export async function GET(req: NextRequest) {
  // Allow: Vercel cron header OR Clerk admin session OR x-admin-secret
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron) {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
  }
  if (!APIFY_TOKEN) {
    return NextResponse.json({ ok: false, error: 'APIFY_TOKEN missing' }, { status: 500 })
  }

  const url = new URL(req.url)

  // 2026-06-12 per Peter ("ONLY ever send emails with insider info on houses
  // nearby that NEED the service"). The promise is "city-flagged homeowners
  // near you." Only true in metros where enforcement scrapers run.
  //
  // 2026-06-13 — LOOP CLOSED. Replaced the static metro list with the
  // daily_zip_targets table written by daily-zip-intelligence (5am UTC).
  // Every morning the algorithm ranks the top-50 zips by violation density
  // + trade diversity − customer saturation. Apify now scrapes contractors
  // in THOSE EXACT zips so cold email targets contractors who live in the
  // same zip where violations cluster = tightest pitch-supply match
  // possible. If daily_zip_targets has no rows for today (algorithm not
  // run yet), falls back to the static ENFORCEMENT_METROS list.
  const ENFORCEMENT_METROS = ['Chicago, IL', 'New York, NY', 'Philadelphia, PA']

  const today = new Date().toISOString().slice(0, 10)
  const { data: zipTargets } = await supabase
    .from('daily_zip_targets')
    .select('zip, city, state')
    .eq('run_date', today)
    .order('rank', { ascending: true })
    .limit(50)

  // Build the list of search locations. Prefer "city, state" combined with
  // their top zips so Apify Google Maps narrows in. If no targets today,
  // fall back to the bare metro list.
  let citiesToScrape: string[] = []
  let usedSource: 'daily_zip_targets' | 'static_fallback' = 'static_fallback'
  if (zipTargets && zipTargets.length > 0) {
    usedSource = 'daily_zip_targets'
    const byCity = new Map<string, string[]>()
    for (const t of zipTargets as Array<{ zip: string; city: string | null; state: string | null }>) {
      const key = t.city && t.state ? `${t.city}, ${t.state}` : null
      if (!key) continue
      if (!byCity.has(key)) byCity.set(key, [])
      byCity.get(key)!.push(t.zip)
    }
    citiesToScrape = [...byCity.keys()]
  }
  if (citiesToScrape.length === 0) {
    citiesToScrape = ENFORCEMENT_METROS
  }

  // ?city= still works for ad-hoc runs but only if it's a metro we have
  // data for today or in the static fallback.
  const singleCity = url.searchParams.get('city')
  if (singleCity) {
    const match = citiesToScrape.find((c) => c.toLowerCase().startsWith(singleCity.toLowerCase().slice(0, 5)))
    if (!match) {
      return NextResponse.json({ ok: false, error: `${singleCity} has no enforcement data — refill targets ${citiesToScrape.join(', ')}` }, { status: 400 })
    }
    citiesToScrape = [match]
  }

  // Optional ?trades=plumbing,roofing override (default = top 3 by yield)
  const tradesParam = url.searchParams.get('trades')
  const tradeKeywords = tradesParam
    ? tradesParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_TRADE_KEYWORDS

  // Per-city scrape target capped at 180 raw places (fits in single-call budget)
  // Fixed per-metro scrape depth (no longer schedule-driven). 120 places ×
  // 2 metros fits the 5-min Apify+enrich budget; the cron can run again to
  // go deeper. Bump once more inboxes need more daily supply.
  const perCityScrapeTarget = 120

  const inserted: string[] = []
  const errors: string[] = []
  const cityResults: Array<{ city: string; raw: number; passed_icp: number; verified: number; inserted: number }> = []

  for (const city of citiesToScrape) {
    try {
      const places = await scrapeCity(city, perCityScrapeTarget, tradeKeywords)
      const websites = [...new Set(places.map((p) => p.website!).filter(Boolean))].slice(0, 120)
      const emails = await enrichEmails(websites)
      let cityCount = 0
      let cityVerified = 0
      let cityDropped = 0
      for (const p of places) {
        if (!p.website) continue
        const pHost = hostOf(p.website)
        const email = pHost ? emails.get(pHost) : undefined
        const trade = classifyTrade(p.categoryName)
        if (!email || !trade) continue
        cityVerified++
        const v = await verifyEmail(email)
        if (!v.ok) { cityDropped++; continue }
        const row = {
          email,
          business_name: p.title?.slice(0, 200) || null,
          city: p.city || city.split(',')[0]?.trim() || null,
          state: p.state || city.split(',')[1]?.trim() || null,
          trade,
          status: 'queued' as const,
          owner_phone: p.phone || null,
        }
        const { error } = await supabase.from('outreach_leads').insert(row)
        if (!error) { inserted.push(email); cityCount++ }
        // UNIQUE(email) violations silently dropped (dedup behavior)
      }
      cityResults.push({ city, raw: places.length, passed_icp: places.length, verified: cityVerified, inserted: cityCount, websites: websites.length, emails_found: emails.size } as never)
      console.log(`[refill] ${city}: raw=${places.length}, verified=${cityVerified}, inserted=${cityCount}, dropped=${cityDropped}`)
    } catch (e) {
      errors.push(`${city}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    source: usedSource,
    trades: tradeKeywords,
    cities_scraped: citiesToScrape,
    inserted_count: inserted.length,
    per_city: cityResults,
    errors,
    next_url_for_remaining: null,
    checked_at: new Date().toISOString(),
  })
}
