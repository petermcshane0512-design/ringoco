import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
import GoogleAdsTag from "@/components/GoogleAdsTag";
import GoogleAdsConversion from "@/components/GoogleAdsConversion";
import { META_TITLE, META_DESCRIPTION } from "@/lib/offer";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  // 2026-06-09 — fixed: was initialScale: 0.66 which forced mobile to
  // render the page at 66% size (a fixed-width layout hack). T5 of the
  // offer-rebuild plan requires initial-scale=1 + responsive Tailwind
  // breakpoints on any element that previously overflowed at 375px.
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0B1F3A",
};

const SITE_URL = "https://www.bellavego.com";
const OG_IMAGE = `${SITE_URL}/logo.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  manifest: "/manifest.json",
  title: {
    default: META_TITLE,
    template: "%s · BellAveGo",
  },
  description: META_DESCRIPTION,
  applicationName: "BellAveGo",
  keywords: [
    "contractor leads",
    "HVAC leads",
    "plumbing leads",
    "electrician leads",
    "exclusive homeowner leads",
    "permit-based leads",
    "BellAveGo",
  ],
  authors: [{ name: "BellAveGo" }],
  creator: "BellAveGo",
  publisher: "BellAveGo",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    siteName: "BellAveGo",
    title: META_TITLE,
    description: META_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: META_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: META_TITLE,
    description: META_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  // Favicon + apple-touch-icon are auto-generated from src/app/icon.png and
  // src/app/apple-icon.png via Next.js's App Router file convention. No
  // manual icons config needed — adding one would override the file convention.
};

// JSON-LD Organization schema — helps Google build the right-hand knowledge panel
// for brand-name searches ("bellavego") and ties social profiles to the company.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "BellAveGo",
  alternateName: "BellAveGo AI",
  url: SITE_URL,
  logo: OG_IMAGE,
  description:
    "AI receptionist and growth platform for HVAC, plumbing, electrical, roofing, and handyman pros. Answers calls, books jobs, recovers revenue, runs marketing.",
  founder: {
    "@type": "Organization",
    name: "BellAveGo Team",
  },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Manhattan",
    addressRegion: "NY",
    addressCountry: "US",
  },
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+1-651-467-7829",
    contactType: "customer service",
    areaServed: "US",
    availableLanguage: ["English", "Spanish"],
  },
  sameAs: [
    // Add LinkedIn / Twitter / GitHub URLs here once those exist — each one
    // dramatically accelerates Google indexing for the brand name.
  ],
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "BellAveGo",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "AI receptionist and growth platform for HVAC, plumbing, electrical, roofing, and handyman pros. 24/7 call answering, automated booking, AI-powered marketing operations.",
  offers: [
    { "@type": "Offer", name: "Starter", price: "147", priceCurrency: "USD" },
    { "@type": "Offer", name: "Pro",     price: "297", priceCurrency: "USD" },
    { "@type": "Offer", name: "Elite",   price: "597", priceCurrency: "USD" },
  ],
  aggregateRating: undefined,  // add once we have published reviews
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
          />
          <GoogleAdsTag />
        </head>
        <body>
          <Suspense fallback={null}>
            <GoogleAdsConversion />
          </Suspense>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
