import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sample-report(.*)",
  "/pricing(.*)",
  "/demo(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/stripe/webhook(.*)",
  "/api/twilio(.*)",
  "/api/webhooks(.*)",
  "/api/crons(.*)",
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