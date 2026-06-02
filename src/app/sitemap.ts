import type { MetadataRoute } from 'next'
import { TRADES } from '@/lib/seo/trades'
import { CITIES } from '@/lib/seo/cities'

/**
 * Auto-generated sitemap.xml at https://www.bellavego.com/sitemap.xml.
 *
 * Now includes every programmatic /answering-service/[trade]-[city] page
 * (6 trades × 50 cities = 300 SEO landing pages).
 *
 * Submit once at search.google.com/search-console → Sitemaps:
 *   https://www.bellavego.com/sitemap.xml
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.bellavego.com'
  const now = new Date()
  const fixed: MetadataRoute.Sitemap = [
    { url: `${base}/`,             lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/pricing`,      lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${base}/demo`,         lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sample-report`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/sign-up`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.5 },
    { url: `${base}/sign-in`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${base}/tools/missed-call-calculator`, lastModified: now, changeFrequency: 'monthly', priority: 0.85 },
  ]
  const seoPages: MetadataRoute.Sitemap = []
  for (const t of TRADES) {
    for (const c of CITIES) {
      seoPages.push({
        url: `${base}/answering-service/${t.slug}-${c.slug}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  }
  return [...fixed, ...seoPages]
}
