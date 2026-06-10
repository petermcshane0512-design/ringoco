import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      // Receptionist-era SEO routes — all 301 to homepage.
      // The 300 trade × city combos were sitemap-only (no page.tsx existed)
      // but Google has crawled them. Permanent redirects flush their index
      // entries and consolidate any lingering backlink equity to /.
      { source: "/answering-service/:slug*", destination: "/", permanent: true },
      { source: "/answering-service-for-:trade", destination: "/", permanent: true },
      // Receptionist marketing surfaces removed in the 2026-06-09 leads-only pivot.
      { source: "/tools/missed-call-calculator", destination: "/", permanent: true },
      { source: "/pricing-legacy", destination: "/pricing", permanent: true },
      { source: "/monthly-report", destination: "/", permanent: true },
      { source: "/demo", destination: "/", permanent: true },
      { source: "/r/:reportId", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
