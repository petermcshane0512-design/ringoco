/**
 * Single Google API key resolver. Same Google Cloud project key works for
 * Places API + Maps Static API + Geocoding — Google differentiates by which
 * product is enabled on the key, not by the env var name.
 *
 * Accepts whichever name is set so different parts of the codebase don't have
 * to standardize. Order of preference:
 *   1. GOOGLE_MAPS_API_KEY (canonical name we use going forward)
 *   2. GOOGLE_PLACES_API_KEY (legacy — what was set in .env.local first)
 *   3. NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (only if we ever need it client-side)
 *
 * Server-side use only by default. The NEXT_PUBLIC variant is intentionally
 * the last fallback so it doesn't accidentally leak to client bundles.
 */
export function getGoogleApiKey(): string | undefined {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  )
}
