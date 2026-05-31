import { SAMPLE_REPORT, type ConsultingReport, type ServiceAreaPoint } from './consultingReport'

/**
 * Enrich a sample-report payload with REAL Google Places competitor data
 * (lat/lng + names) for the configured service area. Runs server-side so the
 * API key never leaves the box.
 *
 * Used by /sample-report/page.tsx to render the public demo with real
 * competitor pins around either:
 *   - The default fictional "Mike's HVAC" demo location, or
 *   - A real prospect's business (via ?for=&zip= URL params)
 *
 * The "business" pin itself is intentionally NOT a real address when the
 * report is the default fictional demo — we plot it at the centroid of the
 * service area so the map composition reads correctly, and the disclosure
 * footer makes the demo nature explicit. For personalized reports (prospect
 * lookups), the business pin uses the prospect's real Place geometry.
 */

const DEFAULT_BUSINESS_TYPE = 'HVAC'

// Approximate centroid for Mike's HVAC fictional demo (St. Louis Park, MN).
// Used so the "Y" marker has a real coordinate on the map without claiming
// to be a real business address.
const MIKES_DEMO_CENTROID = { lat: 44.9489, lng: -93.3479 }

type EnrichInput = {
  base: ConsultingReport
  /** Real prospect business name from ?for=... — when set, we look it up as
   *  the "Y" pin instead of using the fictional demo centroid. */
  prospectName?: string
  /** Real prospect ZIP — used as the geographic anchor for the competitor
   *  search. Falls back to the report's primaryZip. */
  prospectZip?: string
  /** Real prospect business type — falls back to the report's businessType. */
  prospectType?: string
  /** Real prospect city — used to override the map centerLabel so the
   *  Google Maps embed centers on the prospect's metro, not the demo's. */
  prospectCity?: string
}

type GooglePlace = {
  name?: string
  place_id?: string
  rating?: number
  user_ratings_total?: number
  geometry?: { location?: { lat?: number; lng?: number } }
  formatted_address?: string
}

export async function enrichSampleReport(input: EnrichInput): Promise<ConsultingReport> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return input.base // graceful — keep stylized SVG

  const businessType = input.prospectType || input.base.meta.businessType || DEFAULT_BUSINESS_TYPE
  const area = input.prospectZip || input.base.meta.primaryZip || input.base.meta.metroLabel

  // ── 1. Find competitors near the area ──────────────────────────
  let competitors: GooglePlace[] = []
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${encodeURIComponent(`${businessType} near ${area}`)}` +
      `&key=${apiKey}`
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } }) // 24h cache
    const data = (await res.json()) as { results?: GooglePlace[] }
    competitors = data.results ?? []
  } catch {
    return input.base // network blip — fall back gracefully
  }

  // ── 2. Pick the "Y" (business) pin ─────────────────────────────
  let businessPin: { lat: number; lng: number; label: string; note?: string } | null = null

  if (input.prospectName) {
    // Real prospect — look up their business and pin at the real geometry.
    try {
      const q = encodeURIComponent(`${input.prospectName} ${area}`)
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${apiKey}`
      const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } })
      const data = (await res.json()) as { results?: GooglePlace[] }
      const hit = data.results?.[0]
      const loc = hit?.geometry?.location
      if (loc?.lat != null && loc?.lng != null) {
        businessPin = {
          lat: loc.lat,
          lng: loc.lng,
          label: 'Y',
          note: `${input.prospectName} · your business`,
        }
        // Exclude self from competitor list so we don't double-plot
        if (hit?.place_id) {
          competitors = competitors.filter((c) => c.place_id !== hit.place_id)
        }
      }
    } catch { /* fall through to centroid */ }
  }

  if (!businessPin) {
    // Demo mode — use the fictional centroid
    businessPin = {
      lat: MIKES_DEMO_CENTROID.lat,
      lng: MIKES_DEMO_CENTROID.lng,
      label: 'Y',
      note: `${input.base.meta.businessName} · demo business`,
    }
  }

  // ── 3. Build the new points array — real competitor pins ──────
  const points: ServiceAreaPoint[] = []

  // Map composition: business at center, competitors labeled C1-C5
  points.push({
    kind: 'business',
    label: businessPin.label,
    x: 50, // SVG fallback position (used if Google fails)
    y: 50,
    lat: businessPin.lat,
    lng: businessPin.lng,
    note: businessPin.note,
  })

  // Top 5 competitors by review count (deeper signal of "real" presence)
  const competitorsByReviews = [...competitors]
    .filter((c) => c.geometry?.location?.lat != null && c.geometry?.location?.lng != null)
    .sort((a, b) => (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0))
    .slice(0, 5)

  competitorsByReviews.forEach((c, i) => {
    const lat = c.geometry!.location!.lat!
    const lng = c.geometry!.location!.lng!
    const star = c.rating ? ` · ★${c.rating.toFixed(1)}` : ''
    const reviewCt = c.user_ratings_total ? ` · ${c.user_ratings_total} reviews` : ''
    points.push({
      kind: 'competitor',
      label: `C${i + 1}`,
      // Stylized fallback x/y if Google markers don't render (shouldn't happen)
      x: 28 + (i * 12) % 50,
      y: 30 + (i * 17) % 40,
      lat,
      lng,
      note: `${c.name ?? 'Competitor'}${star}${reviewCt}`,
    })
  })

  // ── 4. Return the enriched report ─────────────────────────────
  // ALSO override centerLat/Lng/Label so the Google Maps embed centers on
  // the prospect's actual metro — not the St. Louis Park demo default.
  // Bug shipped pre-2026-05-31: only `points` was being overridden, so
  // generated reports for AZ/TX/FL prospects all showed the map centered
  // on Minneapolis Metro. Caught by Peter when his Skilled Solutions
  // Cave Creek report rendered with Lebanon, Indiana coords.
  const overrideCenter =
    businessPin && businessPin.lat != null && businessPin.lng != null
      ? {
          centerLat: businessPin.lat,
          centerLng: businessPin.lng,
          centerLabel: input.prospectCity
            ? input.prospectCity
            : input.base.meta.metroLabel || input.base.serviceAreaMap.centerLabel,
        }
      : {}

  return {
    ...input.base,
    serviceAreaMap: {
      ...input.base.serviceAreaMap,
      ...overrideCenter,
      points,
    },
  }
}

/** Convenience for page.tsx — runs enrichment on the static SAMPLE_REPORT. */
export async function getEnrichedSampleReport(opts: {
  prospectName?: string
  prospectZip?: string
  prospectType?: string
} = {}): Promise<ConsultingReport> {
  return enrichSampleReport({
    base: SAMPLE_REPORT,
    prospectName: opts.prospectName,
    prospectZip: opts.prospectZip,
    prospectType: opts.prospectType,
  })
}
