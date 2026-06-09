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
const APIFY_CONTACT_ACTOR = 'lukaskrivka~contact-info-scraper'

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

type ContactItem = {
  url?: string
  emails?: string[]
}

// Top 3 highest-yield trades only — keeps Apify scrape under 300s timeout.
// Use ?trades= query param to override (e.g. ?trades=plumbing,roofing for
// dedicated trade-expansion runs).
const DEFAULT_TRADE_KEYWORDS = ['hvac', 'plumbing', 'electrical']

function classifyTrade(category?: string): string | null {
  const c = (category || '').toLowerCase()
  if (/hvac|air condition|heating|cooling/.test(c)) return 'HVAC'
  if (/plumb/.test(c)) return 'Plumbing'
  if (/electric/.test(c)) return 'Electrical'
  if (/roof/.test(c)) return 'Roofing'
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
  const items = await apifyRunSync<MapsItem>(APIFY_MAPS_ACTOR, {
    searchStringsArray: tradeKeywords.map((kw) => `${kw} ${city}`),
    maxCrawledPlacesPerSearch: Math.min(60, Math.ceil(targetCount / tradeKeywords.length)),
    language: 'en',
    countryCode: 'us',
    skipClosedPlaces: true,
    onlyDataFromSearchPage: false,
  }, 180_000)  // 3 min cap on maps actor
  const filtered = items.filter(passesSoloOrSmallCrewFilter)
  console.log(`[refill] ${city}: ${items.length} raw → ${filtered.length} pass 1-3 person crew filter`)
  return filtered
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
    if (!it.url || !it.emails || it.emails.length === 0) continue
    const valid = it.emails.find((e) => !/noreply|no-reply|abuse|postmaster/i.test(e))
    if (valid) out.set(it.url, valid.toLowerCase())
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
  const targetDate = url.searchParams.get('date') || todayIso()
  const day = loadSchedule(targetDate)
  if (!day) {
    return NextResponse.json({ ok: false, error: `no schedule entry for ${targetDate}` })
  }

  // ?city=Phoenix, AZ → scrape ONE city (fits in 5-min Vercel timeout)
  // No ?city → scrape ALL cities in schedule (only safe if total raw is small;
  // cron sets this once-per-day at 1am UTC where 5-min limit is OK).
  // 2026-06-09 — city param can OVERRIDE today's schedule. Falls through to
  // schedule list only if the city name matches one already there.
  const singleCity = url.searchParams.get('city')
  let citiesToScrape: string[] = day.cities
  if (singleCity) {
    const matchInSchedule = day.cities.find((c) => c.toLowerCase().startsWith(singleCity.toLowerCase().slice(0, 6)))
    citiesToScrape = matchInSchedule
      ? [matchInSchedule]
      : [singleCity.includes(',') ? singleCity : `${singleCity}, FL`]  // ad-hoc override; assumes FL if no state given
  }

  // Optional ?trades=plumbing,roofing override (default = top 3 by yield)
  const tradesParam = url.searchParams.get('trades')
  const tradeKeywords = tradesParam
    ? tradesParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_TRADE_KEYWORDS

  // Per-city scrape target capped at 180 raw places (fits in single-call budget)
  const perCityScrapeTarget = Math.min(180, Math.ceil(day.scrape_target / day.cities.length))

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
        const email = emails.get(p.website)
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
      cityResults.push({ city, raw: places.length, passed_icp: places.length, verified: cityVerified, inserted: cityCount })
      console.log(`[refill] ${city}: raw=${places.length}, verified=${cityVerified}, inserted=${cityCount}, dropped=${cityDropped}`)
    } catch (e) {
      errors.push(`${city}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    target_date: targetDate,
    trades: tradeKeywords,
    cities_scraped: citiesToScrape,
    inserted_count: inserted.length,
    per_city: cityResults,
    errors,
    next_url_for_remaining: !singleCity
      ? null
      : `/api/crons/refill-outreach-queue?date=${targetDate}&city=<next-city-prefix>`,
    checked_at: new Date().toISOString(),
  })
}
