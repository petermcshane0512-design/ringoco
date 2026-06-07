import type { Metadata } from 'next'

/**
 * /admin/* layout — applies noindex / nofollow / nosnippet metadata to
 * every admin page so crawlers explicitly skip them even if someone
 * leaks a URL. Belt-and-suspenders on top of robots.ts (Disallow: /admin/).
 *
 * Per-page auth gating still happens in each route via requireAdmin().
 */
export const metadata: Metadata = {
  title: 'BellAveGo Nucleus',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-snippet': -1,
      'max-image-preview': 'none',
      'max-video-preview': -1,
    },
  },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
