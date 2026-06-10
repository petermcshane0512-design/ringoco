import type { MetadataRoute } from 'next'

/**
 * Auto-generated sitemap.xml at https://www.bellavego.com/sitemap.xml.
 *
 * 2026-06-09 — Receptionist-era SEO surfaces (300 trade × city combos,
 * /answering-service-for-*, /tools/missed-call-calculator, /monthly-report,
 * /demo, /r/[reportId]) were sitemap-only or removed. They now 301 to / via
 * next.config.ts redirects, and are excluded here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.bellavego.com'
  const now = new Date()
  return [
    { url: `${base}/`,             lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/pricing`,      lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${base}/founder`,      lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sample-report`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sign-up`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.5 },
    { url: `${base}/sign-in`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${base}/privacy`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/terms`,        lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ]
}
