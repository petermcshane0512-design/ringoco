import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  // PWA manifest — must be publicly fetchable so install banner works
  // for signed-in AND anonymous visitors. The middleware matcher excludes
  // .js but NOT .json (due to the (?!on) lookahead), so without this
  // entry Clerk blocks /manifest.json → PWA install fails silently.
  "/manifest.json",
  "/sample-report(.*)",
  "/pricing(.*)",
  // Creator-tagged landing — sets bavg_creator_code cookie + redirects.
  // Must be public so prospect visiting bellavego.com/ref/BAVG-XXXXXX before
  // signing in isn't blocked by Clerk. Moved from /r/* (collided w/ existing
  // /r/[reportId] dashboard route — Next.js can't have two dynamic params
  // at the same level).
  "/ref/(.*)",
  "/demo(.*)",
  "/founder(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/goodbye(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  // Programmatic SEO landing pages — must be publicly indexable by Google.
  "/answering-service(.*)",
  "/answering-service-for(.*)",
  "/tools(.*)",
  "/sitemap.xml",
  "/robots.txt",
  // Concierge + Multi-Location waitlist — public form for prospects who don't
  // have accounts yet. /api/waitlist receives the POST from the form.
  "/waitlist(.*)",
  "/api/waitlist(.*)",
  "/api/stripe/webhook(.*)",
  "/api/twilio(.*)",
  "/api/webhooks(.*)",
  "/api/crons(.*)",
  // Image proxy — called from <img src=...> tags on public pages, never
  // carries Clerk auth. The route itself has its own server-side guard
  // (API key + Google handles abuse via referrer restrictions).
  "/api/google-static-map(.*)",
  // Vapi inbound webhooks — Vapi authenticates via x-vapi-secret / signature
  // header verified in the route itself, not via Clerk session.
  "/api/vapi(.*)",
  // Calendar tool endpoints — called by Vapi mid-conversation. They authenticate
  // via x-vapi-signature header (verified inside each route via verifyVapiSignature).
  "/api/calendar/availability(.*)",
  "/api/calendar/book(.*)",
  // Sample report personalize is a public endpoint used by /sample-report
  // (anonymous prospects). Has its own light rate-limit via cache.
  "/api/sample-report(.*)",
  // OG image generator — public, called by social-media scrapers.
  "/api/og(.*)",
  // Internal admin endpoints — own auth via requireAdmin() (x-admin-secret
  // header or admin Clerk session). Clerk middleware would otherwise 404
  // these before they reach the route handler, blocking curl/script use.
  "/api/internal(.*)",
  // Click tracking — called from cold-email links by anonymous prospects.
  // No auth = the WHOLE point. Records report_visit_at + caller_consent_at
  // on outreach_leads. Without this in public list, Instantly clicks 404
  // and we never know who opened the report.
  "/api/track(.*)",
  // Admin endpoints — same pattern: every /api/admin/* route starts with
  // `await requireAdmin()` (CLAUDE.md contract). Marking public here lets
  // the dual-auth (x-admin-secret OR Clerk session) work for curl/scripts.
  // Without this, Clerk middleware redirects unauthenticated curl to a
  // sign-in HTML page before requireAdmin can verify the header.
  "/api/admin(.*)",
  // Agent endpoints — same requireAdmin() contract as /api/admin. 2026-06-11:
  // lib/leadEngine's auto-replenish calls /api/agents/find-real-leads
  // server-to-server with x-admin-secret (no Clerk session). Without this
  // entry Clerk intercepted the call with a sign-in redirect, the engine
  // parsed {} and reported "replenish pulled 0 (spent 0c)" with no error —
  // the exact silent-starvation Peter hit on his first paid account.
  "/api/agents(.*)",
  // Public marketing surfaces — anonymous landing-page visitors must be
  // able to hit these. /api/live-feed feeds the LiveLeadFeed ticker and
  // LiveStatBar count-up on the homepage + /free-lead. /api/opportunity-check
  // powers the homepage zip widget. /api/territory/check powers /start/area.
  // /api/free-lead/* serves the cold-email landing.
  "/api/live-feed(.*)",
  "/api/opportunity-check(.*)",
  "/api/territory(.*)",
  // 2026-06-11 — /start/area (anonymous, pre-signup) calls both of these.
  // They were NOT public, so Clerk middleware returned an HTML sign-in
  // bounce instead of JSON — which surfaced as "could not verify that
  // address" (geocode-preview blocked) AND a missing address dropdown
  // (places-autocomplete blocked). The Google key was fine all along.
  "/api/geocode-preview(.*)",
  "/api/places-autocomplete(.*)",
  "/free-lead(.*)",
  "/api/free-lead(.*)",
  "/start(.*)",
  "/api/stripe/checkout(.*)",
  // 2026-06-11 — /checkout/return is where Stripe sends the customer
  // AFTER payment, and in the frictionless flow they are STILL ANONYMOUS
  // at that moment (the Clerk user is minted ON this page). It was not
  // public, so Clerk middleware bounced paid customers to the homepage
  // before activation ran — profile never seeded, sign-in never issued,
  // dashboard made them redo onboarding. The page self-authorizes via the
  // Stripe session_id (verified server-side against payment_status).
  "/checkout/return(.*)",
]);

/**
 * Referral attribution cookie. Customers share links like
 * https://www.bellavego.com/?ref=BAVG-MK7H2X — we drop that into a 90-day
 * cookie so when the visitor signs up + pays, the Stripe webhook can
 * credit the original referrer a free month.
 *
 * 90 days = long enough for normal evaluation cycles, short enough to
 * fade if they never sign up.
 */
const REF_COOKIE_NAME = "bavg_ref";
const REF_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
// Format: BAVG-XXXXXX (6 uppercase alphanumeric). Reject anything else
// so we don't store arbitrary junk from the query string.
const VALID_REF_RE = /^BAVG-[A-Z0-9]{6}$/;

export default clerkMiddleware(async (auth, request) => {
  // ── Referral attribution — capture ?ref= once per visitor ──
  // Runs before Clerk auth so it works for anonymous landing-page visitors.
  let response: NextResponse | null = null;
  try {
    const refParam = request.nextUrl.searchParams.get("ref");
    if (refParam) {
      const normalized = refParam.toUpperCase().trim();
      const already = request.cookies.get(REF_COOKIE_NAME)?.value;
      // Only set if we don't already have one — first attribution wins
      // (prevents a competitor referrer-link from stealing credit if the
      // prospect was already in someone else's funnel).
      if (!already && VALID_REF_RE.test(normalized)) {
        response = NextResponse.next();
        response.cookies.set(REF_COOKIE_NAME, normalized, {
          maxAge: REF_COOKIE_MAX_AGE_SECONDS,
          httpOnly: false, // readable client-side so onboarding form can pre-fill
          sameSite: "lax",
          path: "/",
        });
      }
    }
  } catch {
    // Cookie parsing or response construction failure — non-fatal,
    // continue with normal request flow.
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
  return response ?? undefined;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
