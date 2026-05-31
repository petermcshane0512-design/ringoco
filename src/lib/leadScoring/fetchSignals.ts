/**
 * Pulls observable signals about a prospect from the data we already have
 * (Google Places, Apify scrape) + cheap fetches (homepage snippet).
 *
 * No Apify call here — we use what's already on outreach_leads. The website
 * snippet is fetched directly with node-fetch (~1 sec, $0 cost).
 */

import type { ProspectSignals, Trade } from './types'

const TRADE_MAP: Record<string, Trade> = {
  'hvac contractor': 'HVAC',
  'air conditioning': 'HVAC',
  'heating contractor': 'HVAC',
  'hvac': 'HVAC',
  'plumber': 'plumbing',
  'plumbing': 'plumbing',
  'electrician': 'electrical',
  'electrical contractor': 'electrical',
  'electrical': 'electrical',
  'garage door': 'garage_door',
  'locksmith': 'locksmith',
  'pest control': 'pest_control',
  'exterminator': 'pest_control',
  'pool service': 'pool_service',
  'pool maintenance': 'pool_service',
  'pool cleaning': 'pool_service',
}

export function normalizeTrade(raw: string | null | undefined): Trade {
  const t = (raw || '').toLowerCase().trim()
  for (const [needle, trade] of Object.entries(TRADE_MAP)) {
    if (t.includes(needle)) return trade
  }
  return 'HVAC' // safe default — matches existing pipeline
}

const NEG_KEYWORDS = {
  has_answering_service_mentioned: [
    'answering service', '24/7 receptionist', 'live answer', 'dispatch team',
    'office staff', 'customer service team', 'we never miss', 'we always answer',
  ],
  emergency_service_listed: ['24/7', '24 hour', 'emergency', 'after hours'],
  business_hours_listed: ['hours:', 'open', 'monday', 'mon-fri', 'm-f', 'closed'],
  has_booking_system: ['book online', 'schedule online', 'schedule now', 'request appointment'],
}

export type FetchSignalsInput = {
  business_name: string
  trade_raw: string | null
  city: string | null
  state: string | null
  review_count: number | null
  rating: number | null
  website_url: string | null
  cached_snippet?: string | null
}

export async function fetchWebsiteSnippet(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const u = url.startsWith('http') ? url : `https://${url}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(u, {
      headers: { 'User-Agent': 'Mozilla/5.0 BellAveGoBot/1.0 (research-only)' },
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const html = await res.text()
    // Strip tags + scripts + style, collapse whitespace, take first 2000 chars
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
    return text.slice(0, 2000)
  } catch {
    return null
  }
}

export async function buildSignals(input: FetchSignalsInput): Promise<ProspectSignals> {
  const trade = normalizeTrade(input.trade_raw)
  const snippet = input.cached_snippet
    ?? (input.website_url ? await fetchWebsiteSnippet(input.website_url) : null)

  const lowText = (snippet || '').toLowerCase()
  const hasMatch = (list: string[]) => list.some((k) => lowText.includes(k.toLowerCase()))

  // Rough employee estimate from review count + snippet markers
  let employee_est: number | null = null
  if (input.review_count != null) {
    if (input.review_count >= 300) employee_est = 25 // big shop
    else if (input.review_count >= 100) employee_est = 10
    else if (input.review_count >= 30) employee_est = 5
    else if (input.review_count >= 5) employee_est = 3
    else if (input.review_count >= 1) employee_est = 2
    else employee_est = 1
  }

  // Sentiment from snippet — naive but cheap
  let sentiment: ProspectSignals['recent_review_sentiment'] = 'unknown'
  if (lowText) {
    const positive = (lowText.match(/excellent|professional|on time|recommend|fast|honest/g) ?? []).length
    const negative = (lowText.match(/terrible|rude|scam|overpriced|never/g) ?? []).length
    if (positive > negative * 2) sentiment = 'positive'
    else if (negative > positive) sentiment = 'negative'
    else if (positive > 0) sentiment = 'mixed'
  }

  return {
    business_name: input.business_name,
    trade,
    city: input.city ?? '',
    state: input.state ?? '',
    review_count: input.review_count,
    rating: input.rating,
    website_url: input.website_url,
    website_snippet: snippet,
    employee_count_est: employee_est,
    has_review_responses: false, // populated later from Google Places review responses
    recent_review_sentiment: sentiment,
    business_hours_listed: hasMatch(NEG_KEYWORDS.business_hours_listed),
    emergency_service_listed: hasMatch(NEG_KEYWORDS.emergency_service_listed),
    has_booking_system: hasMatch(NEG_KEYWORDS.has_booking_system),
    has_answering_service_mentioned: hasMatch(NEG_KEYWORDS.has_answering_service_mentioned),
  }
}
