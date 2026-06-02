import type { MetadataRoute } from 'next'

/**
 * Auto-generated robots.txt at https://www.bellavego.com/robots.txt.
 *
 * Allows all crawlers everywhere except authenticated/admin/API surfaces.
 * Points crawlers at the sitemap for efficient indexing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard/',
          '/admin/',
          '/api/',
          '/onboarding/',
          '/sign-in/',
          '/sign-up/',
          '/r/',  // private report viewer — uses unguessable UUIDs but no need to crawl
          // Personalized cold-outreach growth reports — 1:1 attachments,
          // not SEO content. Backed up by noindex meta tag on the page
          // itself so even direct discovery doesn't index them.
          '/sample-report',
        ],
      },
    ],
    sitemap: 'https://www.bellavego.com/sitemap.xml',
    host: 'https://www.bellavego.com',
  }
}
