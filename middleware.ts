import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sample-report(.*)",
  "/pricing(.*)",
  "/demo(.*)",
  "/founder(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
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