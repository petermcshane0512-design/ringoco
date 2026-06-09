import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { promises as dns } from 'node:dns'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/fast-refill-outreach-queue?city=Tampa
 *
 * Fast-path refill. Skips Apify Contact Info scraper (too slow for Vercel
 * 300s budget). Instead:
 *
 *   1. Apify Google Maps Scraper for city + trade keywords (~60-90 sec)
 *   2. For each place w/ website → extract domain
 *   3. MX-check domain (cheap DNS lookup, ~50ms each, cached)
 *   4. Construct email as info@<domain> (or hello@/contact@ fallback)
 *   5. Insert into outreach_leads w/ that constructed email
 *
 * Trade-off: ~30-50% deliverable rate vs ~70% w/ verified email. Higher
 * bounce risk. BUT: throughput unblocked, fits Vercel timeout, no Apify
 * enrichment dependency.
 *
 * Used today (2026-06-09) as fallback while refill-outreach-queue route
 * has the Apify timeout bug.
 *
 * Usage:
 *   ?city=Tampa  (assumes FL if no state)
 *   ?city=Phoenix, AZ
 *   ?trades=hvac,plumbing (default: hvac+plumbing+electrical)
 *   ?limit=80 (default: 60 places per trade keyword)
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY
const APIFY_MAPS_ACTOR = 'compass~crawler-google-places'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DEFAULT_TRADES = ['hvac', 'plumbing', 'electrical']

type MapsItem = {
  title?: string
  website?: string
  phone?: string
  city?: string
  state?: string
  zip?: string
  categoryName?: string
  reviewsCount?: number
  permanentlyClosed?: boolean
  imageUrls?: string[]
}

const mxCache = new Map<string, boolean>()

async function hasMx(domain: string): Promise<boolean> {
  if (mxCache.has(domain)) return mxCache.get(domain)!
  try {
    const records = await dns.resolveMx(domain)
    const ok = Array.isArray(records) && records.length > 0
    mxCache.set(domain, ok)
    return ok
  } catch {
    mxCache.set(domain, false)
    return false
  }
}

function extractDomain(websiteUrl: string): string | null {
  if (!websiteUrl) return null
  try {
    const u = new URL(websiteUrl.includes('://') ? websiteUrl : `https://${websiteUrl}`)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function classifyTrade(category?: string): string | null {
  const c = (category || '').toLowerCase()
  if (/hvac|air condition|heating|cooling/.test(c)) return 'HVAC'
  if (/plumb/.test(c)) return 'Plumbing'
  if (/electric/.test(c)) return 'Electrical'
  if (/roof/.test(c)) return 'Roofing'
  return null
}

function passesSoloOrSmallCrewFilter(m: MapsItem): boolean {
  if (!m.website || m.permanentlyClosed) return false
  const reviews = m.reviewsCount ?? 0
  if (reviews > 40) return false
  const title = (m.title || '').toLowerCase()
  if (/&\s+sons|brothers|family/.test(title)) return false
  if (/\b(company|co\.|inc\.?|corp\.?|group|services llc)\b/.test(title)) {
    if (reviews > 20) return false
  }
  if ((m.imageUrls?.length ?? 0) > 12) return false
  return true
}

async function apifyRunSync<T>(actor: string, input: object, timeoutMs: number): Promise<T[]> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${Math.floor(timeoutMs / 1000)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!r.ok) throw new Error(`Apify ${actor} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()) as T[]
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron) {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
  }
  if (!APIFY_TOKEN) {
    return NextResponse.json({ ok: false, error: 'APIFY_TOKEN missing' }, { status: 500 })
  }

  const url = new URL(req.url)
  const cityRaw = url.searchParams.get('city') || 'Tampa'
  const city = cityRaw.includes(',') ? cityRaw : `${cityRaw}, FL`
  const tradesParam = url.searchParams.get('trades')
  const tradeKeywords = tradesParam
    ? tradesParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_TRADES
  const limit = Math.min(100, parseInt(url.searchParams.get('limit') ?? '60', 10))

  // Scrape Apify Google Maps
  let places: MapsItem[] = []
  try {
    places = await apifyRunSync<MapsItem>(APIFY_MAPS_ACTOR, {
      searchStringsArray: tradeKeywords.map((kw) => `${kw} ${city}`),
      maxCrawledPlacesPerSearch: limit,
      language: 'en',
      countryCode: 'us',
      skipClosedPlaces: true,
      onlyDataFromSearchPage: true,
    }, 240_000)
  } catch (e) {
    return NextResponse.json({ ok: false, error: `apify maps failed: ${(e as Error).message}` })
  }

  const filtered = places.filter(passesSoloOrSmallCrewFilter)

  let inserted = 0
  let mxFailed = 0
  let domainBad = 0
  let noTrade = 0
  let dupes = 0
  const samples: Array<{ business: string; email: string }> = []

  for (const p of filtered) {
    const domain = extractDomain(p.website || '')
    if (!domain || domain.includes('facebook') || domain.includes('google') || domain.includes('yelp')) { domainBad++; continue }
    const trade = classifyTrade(p.categoryName)
    if (!trade) { noTrade++; continue }
    if (!(await hasMx(domain))) { mxFailed++; continue }
    const email = `info@${domain}`
    const row = {
      email,
      business_name: p.title?.slice(0, 200) || null,
      city: p.city || city.split(',')[0]?.trim() || null,
      state: p.state || (city.split(',')[1]?.trim() || 'FL'),
      trade,
      status: 'queued' as const,
      owner_phone: p.phone || null,
    }
    const { error } = await supabase.from('outreach_leads').insert(row)
    if (error) {
      if (error.code === '23505') dupes++
      else console.warn('[fast-refill] insert err:', error.message)
    } else {
      inserted++
      if (samples.length < 5) samples.push({ business: row.business_name || '', email })
    }
  }

  return NextResponse.json({
    ok: true,
    city,
    trades: tradeKeywords,
    raw_places: places.length,
    passed_filter: filtered.length,
    inserted,
    dupes,
    mx_failed: mxFailed,
    domain_bad: domainBad,
    no_trade: noTrade,
    samples,
    checked_at: new Date().toISOString(),
  })
}
