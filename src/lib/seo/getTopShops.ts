import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export type SeoShop = {
  name: string
  rating: number | null
  reviews: number
  address: string
  phone: string | null
  website: string | null
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Fetch (or read cached) top 5 shops for a (trade, city) combo.
 * Server-side only — uses the service-role Supabase client + Apify token.
 *
 * Strategy:
 *   1. Look up the seo_shop_cache row for this trade+city
 *   2. If cached + ≤7 days old, return as-is
 *   3. If miss or stale, fetch via Apify compass/crawler-google-places
 *      and write back to cache
 *
 * Returns an empty array silently on any failure — the page renders with
 * a generic competitor-free hero instead of breaking.
 */
export async function getTopShops(
  tradeSlug: string,
  citySlug: string,
  googleQuery: string,
  cityLabel: string,
  stateAbbr: string,
): Promise<SeoShop[]> {
  // 1. Cache check
  try {
    const { data } = await supabase
      .from('seo_shop_cache')
      .select('shops_json, fetched_at')
      .eq('trade_slug', tradeSlug)
      .eq('city_slug', citySlug)
      .maybeSingle()

    if (data?.shops_json) {
      const age = Date.now() - new Date((data as { fetched_at: string }).fetched_at).getTime()
      if (age < CACHE_TTL_MS) {
        return data.shops_json as SeoShop[]
      }
    }
  } catch {
    // proceed to live fetch
  }

  // 2. Live fetch via Apify
  const APIFY = process.env.APIFY_TOKEN
  if (!APIFY) return []

  const shops: SeoShop[] = []
  try {
    const url = `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${APIFY}&clean=true`
    const body = {
      searchStringsArray: [`${googleQuery} in ${cityLabel}, ${stateAbbr}`],
      maxCrawledPlacesPerSearch: 8,
      language: 'en',
      skipClosedPlaces: true,
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const arr = (await res.json()) as Array<{
        title?: string
        totalScore?: number
        reviewsCount?: number
        address?: string
        phoneUnformatted?: string
        phone?: string
        website?: string
        permanentlyClosed?: boolean
      }>
      for (const p of arr) {
        if (p.permanentlyClosed) continue
        shops.push({
          name: p.title ?? 'Unknown shop',
          rating: p.totalScore ?? null,
          reviews: p.reviewsCount ?? 0,
          address: p.address ?? '',
          phone: p.phoneUnformatted ?? p.phone ?? null,
          website: p.website ?? null,
        })
        if (shops.length >= 5) break
      }
    }
  } catch {
    // fall through to empty
  }

  // 3. Write cache (best-effort, never throws into the request path)
  try {
    await supabase.from('seo_shop_cache').upsert(
      {
        trade_slug: tradeSlug,
        city_slug: citySlug,
        shops_json: shops,
        fetched_at: new Date().toISOString(),
        source: 'apify_google_places',
        shop_count: shops.length,
      },
      { onConflict: 'trade_slug,city_slug' },
    )
  } catch {
    // ignore
  }

  return shops
}
