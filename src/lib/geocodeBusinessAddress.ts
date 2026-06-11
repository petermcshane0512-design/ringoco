/**
 * Geocode a business address via Google Maps Geocoding API.
 *
 * Used by /api/profile (on first profile create) + the backfill script
 * to populate business_lat / business_lng / business_geocoded_at on the
 * profiles row.
 *
 * Cost: $0.005 per geocode request (free for first 200/mo per Google).
 * Network: ~150ms typical. Fail-safe: returns null on any error so the
 * profile save still succeeds — the lead engine falls back to zip-centroid
 * radius when lat/lng is null.
 *
 * GOOGLE_MAPS_API_KEY env var required.
 */

const ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json'
const REQUEST_TIMEOUT_MS = 5000

export type GeocodeResult = {
  lat: number
  lng: number
  formatted: string
  // 2026-06-11 — parsed from Google's formatted_address ("..., IL 60643,
  // USA"). Lets /start/area auto-derive the zip from the address instead
  // of asking for it as a separate field (Algorithm step 2: the best
  // form field is no form field). Empty string when not parseable.
  zip: string
}

/** Last 5-digit group in a US formatted address = the zip. */
export function parseZipFromAddress(s: string): string {
  const matches = s.match(/\b\d{5}(?:-\d{4})?\b/g)
  if (!matches || matches.length === 0) return ''
  return matches[matches.length - 1].slice(0, 5)
}

export async function geocodeBusinessAddress(address: string): Promise<GeocodeResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    console.warn('[geocodeBusinessAddress] GOOGLE_MAPS_API_KEY not set; skipping')
    return null
  }
  if (!address || address.trim().length < 5) return null

  const url = `${ENDPOINT}?address=${encodeURIComponent(address)}&key=${key}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) {
      console.warn(`[geocodeBusinessAddress] HTTP ${res.status}`)
      return null
    }
    const data = await res.json() as {
      status: string
      results: { geometry: { location: { lat: number; lng: number } }; formatted_address: string }[]
    }
    if (data.status !== 'OK' || data.results.length === 0) {
      console.warn(`[geocodeBusinessAddress] status=${data.status} for "${address.slice(0, 80)}"`)
      return null
    }
    const top = data.results[0]
    return {
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
      formatted: top.formatted_address,
      zip: parseZipFromAddress(top.formatted_address),
    }
  } catch (e) {
    clearTimeout(timeout)
    const msg = (e as Error).message || String(e)
    console.warn(`[geocodeBusinessAddress] failed: ${msg}`)
    return null
  }
}

/**
 * Haversine distance between two lat/lng points in MILES.
 * Used by find-real-leads to filter BatchData results to within N miles
 * of the contractor's lat/lng.
 */
export function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.7613  // Earth radius miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
