import type { MetadataRoute } from 'next'

/**
 * Auto-generated sitemap.xml at https://www.bellavego.com/sitemap.xml.
 *
 * Submit this URL to Google Search Console once after launch:
 *   search.google.com/search-console → Sitemaps → Add new sitemap
 *
 * Next.js builds this at request time and serves with correct Content-Type.
 * Add new public routes here as they ship.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.bellavego.com'
  const now = new Date()
  return [
    { url: `${base}/`,            lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/pricing`,     lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${base}/demo`,        lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sample-report`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/sign-up`,     lastModified: now, changeFrequency: 'yearly',  priority: 0.5 },
    { url: `${base}/sign-in`,     lastModified: now, changeFrequency: 'yearly',  priority: 0.4 },
  ]
}
