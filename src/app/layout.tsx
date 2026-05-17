import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,  // allow pinch-zoom (accessibility), but don't auto-zoom out
  themeColor: "#0B1F3A",
};

const SITE_URL = "https://www.bellavego.com";
const OG_IMAGE = `${SITE_URL}/logo.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "BellAveGo — AI Receptionist + AI Marketing for home service pros",
    template: "%s · BellAveGo",
  },
  description:
    "AI answers every call, books the job, follows up on quotes, recovers past-due invoices, and runs your marketing — automatically. Built for home service contractors of 1–15. From $397/mo. 30-day money-back.",
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
    title: "BellAveGo — AI Receptionist + AI Marketing for home service pros",
    description:
      "AI answers every call, books the job, follows up on quotes, recovers past-due invoices, and runs your marketing — all on autopilot. Built for home service teams of 1–15.",
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "BellAveGo — AI built for home service pros",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BellAveGo — AI Receptionist + AI Marketing for home service pros",
    description:
      "AI answers every call, books the job, runs your marketing. Built for home service contractors. From $397/mo.",
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
    "AI Receptionist + AI Marketing platform for home service contractors. Answers calls, books jobs, recovers revenue, runs marketing.",
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
    "AI Receptionist + AI Marketing platform for home service contractors. 24/7 call answering, automated booking, AI-powered marketing operations.",
  offers: [
    { "@type": "Offer", name: "Receptionist",    price: "397",  priceCurrency: "USD" },
    { "@type": "Offer", name: "Office Manager",  price: "797",  priceCurrency: "USD" },
    { "@type": "Offer", name: "Concierge",       price: "1997", priceCurrency: "USD" },
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
