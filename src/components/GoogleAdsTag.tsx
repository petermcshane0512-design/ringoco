"use client";

import Script from "next/script";

/**
 * Loads gtag.js once site-wide when NEXT_PUBLIC_GOOGLE_ADS_ID is set.
 * Used by GoogleAdsConversion to fire trial-signup conversion events
 * from /dashboard/setup?welcome=1&trial=1 (Stripe checkout success page).
 *
 * Env required (Vercel):
 *   NEXT_PUBLIC_GOOGLE_ADS_ID         e.g. AW-1234567890
 *   NEXT_PUBLIC_GOOGLE_ADS_TRIAL_LABEL  e.g. AbCdEfGhIjKl  (conversion label, set in Google Ads UI)
 */
export default function GoogleAdsTag() {
  const id = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  if (!id) return null;
  return (
    <>
      <Script
        id="gtag-loader"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${id}');
        `}
      </Script>
    </>
  );
}
