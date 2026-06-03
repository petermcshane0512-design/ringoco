"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Fires the Google Ads "trial_signup" conversion event when the user lands on
 * /dashboard/setup?welcome=1&trial=1 — i.e. immediately post-Stripe checkout.
 *
 * Idempotent per session: sessionStorage flag prevents double-fire on
 * remount, Strict Mode, or tab refresh during the same session.
 *
 * Requires GoogleAdsTag (which loads gtag.js) to already be in layout.tsx.
 */
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const STORAGE_KEY = "bavg_gads_trial_fired";

export default function GoogleAdsConversion() {
  const params = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (params.get("welcome") !== "1" || params.get("trial") !== "1") return;

    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;

    const id = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
    const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_TRIAL_LABEL;
    if (!id || !label) return;

    const send_to = `${id}/${label}`;

    if (typeof window.gtag === "function") {
      window.gtag("event", "conversion", {
        send_to,
        value: 147.0,
        currency: "USD",
        transaction_id: `trial-${Date.now()}`,
      });
      sessionStorage.setItem(STORAGE_KEY, "1");
    }
  }, [params]);

  return null;
}
