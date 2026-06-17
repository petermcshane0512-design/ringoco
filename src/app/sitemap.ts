import type { MetadataRoute } from 'next'
import { CITIES } from '@/lib/seo/cities'
import { TRADES } from '@/lib/seo/trades'

/**
 * Auto-generated sitemap.xml at https://www.bellavego.com/sitemap.xml.
 *
 * 2026-06-17 — added the programmatic lead-gen SEO tree:
 *   /leads                       (hub)
 *   /leads/[city]                (52 city indexes)
 *   /leads/[city]/[trade]        (52 × 6 = 312 money pages)
 * Targets "free {trade} leads {city}" inbound search. Replaces the dead
 * receptionist-era /answering-service/* surfaces (still 301 to / via
 * next.config.ts).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.bellavego.com'
  const now = new Date()

  const core: MetadataRoute.Sitemap = [
    { url: `${base}/`,             lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/pricing`,      lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${base}/leads`,        lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${base}/founder`,      lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sample-report`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sign-up`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.5 },
    { url: `${base}/sign-in`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${base}/privacy`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/terms`,        lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ]

  const cityIndexes: MetadataRoute.Sitemap = CITIES.map((c) => ({
    url: `${base}/leads/${c.slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  const cityTrade: MetadataRoute.Sitemap = CITIES.flatMap((c) =>
    TRADES.map((t) => ({
      url: `${base}/leads/${c.slug}/${t.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  )

  return [...core, ...cityIndexes, ...cityTrade]
}
