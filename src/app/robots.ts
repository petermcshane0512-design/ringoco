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
        ],
      },
    ],
    sitemap: 'https://www.bellavego.com/sitemap.xml',
    host: 'https://www.bellavego.com',
  }
}
