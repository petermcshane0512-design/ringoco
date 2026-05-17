import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sample-report(.*)",
  "/pricing(.*)",
  "/demo(.*)",
  "/founder(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
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
  // Calendar availability tool — called by Vapi mid-conversation to read the
  // contractor's free/busy. Vapi authenticates via x-vapi-signature header
  // (verified inside the route via verifyVapiSignature).
  "/api/calendar/availability(.*)",
  // Sample report personalize is a public endpoint used by /sample-report
  // (anonymous prospects). Has its own light rate-limit via cache.
  "/api/sample-report(.*)",
  // OG image generator — public, called by social-media scrapers.
  "/api/og(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};