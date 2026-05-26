import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  // Default mobile scale (1.0). Previously dropped to 0.6 to fit dashboard
  // tables which crushed the landing page's hero proportions — making
  // content look tiny inside a huge "empty" bg. Dashboard tables now
  // handle their own horizontal scroll wrappers, so we keep the natural
  // scale here for proper landing-page sizing.
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
    default: "BellAveGo — AI receptionist and growth platform for home-service businesses",
    template: "%s · BellAveGo",
  },
  description:
    "AI answers every call, books the job, follows up on quotes, recovers past-due invoices, and runs your marketing — automatically. Built for home service contractors of 1–15. From $147/mo. 7-day free trial, cancel anytime.",
  applicationName: "BellAveGo",
  keywords: [
    "AI receptionist",
    "AI for home services",
    "HVAC AI",
    "plumber AI",
    "electrician AI",
    "AI answering service",
    "missed call recovery",
    "AI marketing for contractors",
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
    title: "BellAveGo — AI receptionist and growth platform for home-service businesses",
    description:
      "AI answers every call, books the job, follows up on quotes, recovers past-due invoices, and runs your marketing — all on autopilot. Built for home service teams of 1–15.",
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "BellAveGo — AI receptionist and growth platform for home-service businesses",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BellAveGo — AI receptionist and growth platform for home-service businesses",
    description:
      "AI answers every call, books the job, runs your marketing. Built for home service contractors. From $147/mo.",
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
    "AI receptionist and growth platform for home-service businesses. Answers calls, books jobs, recovers revenue, runs marketing.",
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
    "AI receptionist and growth platform for home-service businesses. 24/7 call answering, automated booking, AI-powered marketing operations.",
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
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
