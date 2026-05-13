/**
 * Daily competitor watcher. Reads Google Places API for each competitor the
 * customer is tracking, writes a daily snapshot to competitor_intel, surfaces
 * deltas (new reviews, rating drift) in the weekly strategy report.
 *
 * Also handles read-only Google Business Profile inspection — the customer's
 * OWN GBP via the same Places API. (Writing to GBP — posting updates, replying
 * to reviews — needs Google Business Profile API + OAuth, not built yet.)
 *
 * Uses the New Places API (places.googleapis.com/v1). Requires GOOGLE_MAPS_API_KEY.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getGoogleApiKey } from '../googleApi'

const PLACES_BASE = 'https://places.googleapis.com/v1'

export type PlaceSnapshot = {
  placeId: string
  name: string
  rating: number
  reviewCount: number
  recentReviews: Array<{
    name: string
    rating: number
    text: string
    publishTime: string
    authorName: string
  }>
}

async function fetchPlace(placeId: string): Promise<PlaceSnapshot | null> {
  const apiKey = getGoogleApiKey()
  if (!apiKey) {
    console.warn('[competitor-watcher] No Google API key set (tried GOOGLE_MAPS_API_KEY + GOOGLE_PLACES_API_KEY); skipping')
    return null
  }
  const url = `${PLACES_BASE}/places/${placeId}`
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,reviews',
    },
  })
  if (!res.ok) {
    console.error(`[competitor-watcher] Places fetch failed for ${placeId}: ${res.status}`)
    return null
  }
  const data = (await res.json()) as {
    id?: string
    displayName?: { text?: string }
    rating?: number
    userRatingCount?: number
    reviews?: Array<{
      name?: string
      rating?: number
      text?: { text?: string }
      publishTime?: string
      authorAttribution?: { displayName?: string }
    }>
  }
  return {
    placeId: data.id ?? placeId,
    name: data.displayName?.text ?? '',
    rating: data.rating ?? 0,
    reviewCount: data.userRatingCount ?? 0,
    recentReviews: (data.reviews ?? []).map(r => ({
      name: r.name ?? '',
      rating: r.rating ?? 0,
      text: r.text?.text ?? '',
      publishTime: r.publishTime ?? '',
      authorName: r.authorAttribution?.displayName ?? '',
    })),
  }
}

export type WatchResult = {
  competitors: number
  snapshotsStored: number
  newReviewsTotal: number
  failures: number
}

export async function watchCompetitorsForCustomer(args: {
  supabase: SupabaseClient
  userId: string
  competitorPlaceIds: string[]
}): Promise<WatchResult> {
  const today = new Date().toISOString().split('T')[0]
  let snapshotsStored = 0
  let newReviewsTotal = 0
  let failures = 0

  for (const placeId of args.competitorPlaceIds) {
    const snap = await fetchPlace(placeId)
    if (!snap) {
      failures++
      continue
    }

    // Count new reviews vs yesterday's snapshot for this competitor (Places returns 5 recents;
    // we treat any with publishTime > yesterday as "new today" — approximate but adequate).
    const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString()
    const newReviews = snap.recentReviews.filter(r => r.publishTime > yesterday).length
    newReviewsTotal += newReviews

    const themes = extractThemes(snap.recentReviews.map(r => r.text).join(' '))

    const { error } = await args.supabase.from('competitor_intel').upsert(
      {
        user_id: args.userId,
        competitor_place_id: placeId,
        competitor_name: snap.name,
        snapshot_date: today,
        rating: snap.rating,
        review_count: snap.reviewCount,
        new_reviews_today: newReviews,
        recent_review_themes: themes,
        raw: snap,
      },
      { onConflict: 'user_id,competitor_place_id,snapshot_date' },
    )
    if (error) {
      console.error('[competitor-watcher] upsert error:', error.message)
      failures++
    } else {
      snapshotsStored++
    }

    // Be polite to Google Places API
    await new Promise(r => setTimeout(r, 120))
  }
  return { competitors: args.competitorPlaceIds.length, snapshotsStored, newReviewsTotal, failures }
}

// Lightweight keyword theming. Returns up to 4 themes mentioned in the recent review text.
// Not NLP — just enough to flag patterns ("3 of last 5 reviews mention pricing" etc.) for the agent.
function extractThemes(text: string): string[] {
  const t = text.toLowerCase()
  const themes: string[] = []
  if (/price|expensive|cheap|overpriced|fair/.test(t)) themes.push('pricing')
  if (/wait|slow|delay|on time|on-time/.test(t)) themes.push('timeliness')
  if (/quality|professional|excellent|terrible|great work/.test(t)) themes.push('quality')
  if (/friendly|rude|polite|nice/.test(t)) themes.push('demeanor')
  if (/clean|mess|tidy/.test(t)) themes.push('cleanliness')
  if (/communicat|respond|text|call back/.test(t)) themes.push('communication')
  return themes.slice(0, 4)
}

// ── Read-only GBP inspection (customer's own profile) ──────────
export async function inspectOwnGbp(args: {
  supabase: SupabaseClient
  userId: string
  googlePlaceId: string
}): Promise<PlaceSnapshot | null> {
  const snap = await fetchPlace(args.googlePlaceId)
  if (!snap) return null
  // Optionally persist a snapshot on the customer's own profile, mirroring competitor_intel.
  // For MVP we just return for the agent to inspect in real time.
  return snap
}
