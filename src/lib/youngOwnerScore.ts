/**
 * Young-owner scoring for outreach_leads.
 *
 * Insight (2026-06-05 cold-call data): old HVAC owners (>40yo, 20+yr shops)
 * won't trust AI. Under-35 founders convert. Filter Instantly + Aaron to
 * young-flagged only.
 *
 * Score 0-100. Threshold: 40 = include in send. 60+ = strong young signal.
 *
 * Pure-function — feeds off data already on the row. No external API.
 */

export type YoungScoreInput = {
  business_name: string | null
  trade: string | null
  review_count?: number | null              // legacy field — may not exist
  employee_count_est: number | null
  website_snippet: string | null
  notes: string | null
  owner_first_name: string | null
  city: string | null
  state: string | null
  // Domain registration date (ISO). Strongest single signal — pre-2010 =
  // legacy shop, post-2021 = young founder. Populated by RDAP enrichment.
  domain_registered_at: string | null
}

export type YoungScoreResult = {
  score: number             // 0-100
  signals: Record<string, number>  // signal → points contributed
}

/**
 * Phrases that scream "old established shop". Subtracts points.
 * Score includes negative weight so a strong "since 1985" lead can't
 * accidentally crack the threshold even with other young signals.
 */
const OLD_SHOP_PATTERNS: Array<[RegExp, number]> = [
  [/\bsince (?:19\d{2}|200\d|201[0-5])\b/i, -35],
  [/\b(20|30|40|50)\+?\s*years?\b/i, -25],
  [/\bsecond[- ]generation|third[- ]generation|family[- ]owned[- ]since\b/i, -20],
  [/\bestablished (?:19\d{2}|200\d|201[0-5])\b/i, -25],
  [/\bfounded (?:19\d{2}|200\d|201[0-5])\b/i, -25],
]

/**
 * Phrases that suggest young-owner / new-shop. Adds points.
 */
const YOUNG_SHOP_PATTERNS: Array<[RegExp, number]> = [
  [/\b(small|local|family[- ]run|veteran[- ]owned)\s+(business|shop|operation)\b/i, +6],
  [/\bestablished (?:202[1-9]|2030)|founded (?:202[1-9]|2030)\b/i, +30],
  [/\bsince (?:202[1-9]|2030)\b/i, +30],
  [/\bnew(?:ly)? (?:opened|launched|started)\b/i, +15],
  [/\bowner[- ]operated\b/i, +10],
  [/\bfounder|entrepreneur|young\b/i, +5],
  [/\bAI[- ]powered|software|app|book online\b/i, +8],  // tech-fluent signals
]

export function scoreYoungOwner(input: YoungScoreInput): YoungScoreResult {
  const signals: Record<string, number> = {}
  let score = 50  // neutral baseline

  // ── Domain age (strongest signal when present) ──
  // RDAP-derived. Pre-2010 = legacy. Post-2021 = young founder.
  if (input.domain_registered_at) {
    const regDate = new Date(input.domain_registered_at)
    if (!isNaN(regDate.getTime())) {
      const yearsOld = (Date.now() - regDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      if (yearsOld < 3) signals.domain_very_young = 35      // post-2023
      else if (yearsOld < 6) signals.domain_young = 25       // 2020-2022
      else if (yearsOld < 10) signals.domain_mid = 10        // 2016-2019
      else if (yearsOld < 15) signals.domain_established = -10  // 2011-2015
      else if (yearsOld < 25) signals.domain_old = -25       // 2001-2010
      else signals.domain_legacy = -35                        // pre-2001
    }
  }

  // ── review_count signal (legacy field, may be undefined) ──
  // Reviews are a proxy for time-in-business. Newer biz = fewer reviews.
  // Sweet spot for "young owner active <5yr": 5-60 reviews.
  const rc = input.review_count
  if (typeof rc === 'number') {
    if (rc <= 5) signals.review_count_very_new = 15
    else if (rc <= 30) signals.review_count_small_dog = 30
    else if (rc <= 80) signals.review_count_mid = 15
    else if (rc <= 200) signals.review_count_established = -10
    else signals.review_count_old_dominant = -25
  }

  // ── employee_count_est ──
  const ec = input.employee_count_est
  if (typeof ec === 'number') {
    if (ec >= 1 && ec <= 3) signals.tiny_team = 20
    else if (ec >= 4 && ec <= 10) signals.small_team = 10
    else if (ec >= 11 && ec <= 25) signals.mid_team = 0
    else if (ec > 25) signals.large_team = -15
  }

  // ── owner_first_name presence (active social presence proxy) ──
  if (input.owner_first_name && input.owner_first_name.trim().length > 1 && input.owner_first_name.toLowerCase() !== 'team') {
    signals.owner_name_known = 5
  }

  // ── trade exact-match signal ──
  // "HVAC" alone suggests modern simple naming. "HVAC Contractor" /
  // "Heating Equipment Supplier" lean older/established corporate.
  const t = (input.trade || '').toLowerCase()
  if (t === 'hvac') signals.trade_modern_naming = 5
  else if (t.includes('contractor') || t.includes('supplier')) signals.trade_corporate_naming = -5

  // ── website + notes text-mining ──
  // notes often contains "web:URL" plus other scraper context.
  // website_snippet has scraped homepage text.
  const text = `${input.website_snippet || ''} ${input.notes || ''} ${input.business_name || ''}`
  for (const [pattern, pts] of OLD_SHOP_PATTERNS) {
    if (pattern.test(text)) {
      const key = `old_phrase_${pattern.source.slice(0, 20)}`
      signals[key] = (signals[key] || 0) + pts
    }
  }
  for (const [pattern, pts] of YOUNG_SHOP_PATTERNS) {
    if (pattern.test(text)) {
      const key = `young_phrase_${pattern.source.slice(0, 20)}`
      signals[key] = (signals[key] || 0) + pts
    }
  }

  // ── business_name length heuristic ──
  // Generic short names ("Bob's HVAC") = older. Modern startup-style
  // names ("Climateflow", "Airly", brandable made-up names) = younger.
  const bn = (input.business_name || '').trim()
  if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)?\s*(LLC|Inc|Co)?$/.test(bn) && bn.length >= 5 && bn.length <= 12) {
    signals.brandable_name = 8
  }
  // "Mike's HVAC", "Joe's Plumbing" pattern = traditional naming
  if (/^[A-Z][a-z]+'s\s/.test(bn)) {
    signals.possessive_traditional_name = -3
  }

  // Sum
  for (const v of Object.values(signals)) score += v

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score))

  return { score, signals }
}
