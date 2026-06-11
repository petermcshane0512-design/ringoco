# BellAveGo — Session Handover (2026-06-11)

Goal: **250 paying users by Sept 1.** ~3 net signups/day. Launch HVAC Q3
cold-email campaign once the funnel is proven end-to-end.

## DEPLOY — read this first
- Vercel **git auto-deploy is broken** (pushes to origin/main don't build).
- **Deploy manually from this machine:** `npx vercel --prod --yes` (CLI is
  authed as petermcshane0512-design, project linked via `.vercel/`).
- Do NOT use the Vercel dashboard "Redeploy" button — it pins an OLD commit
  and silently reverts the site (burned hours today). Always `vercel --prod`.
- Latest deploy: commit `7c85e88`, READY on www.bellavego.com.

## WHAT WORKS (verified live today)
- Homepage opportunity-checker widget → real lead counts.
- /start/area onboarding: dark "aim the scan" console, Google Places
  **address autocomplete dropdown** (type → pick), geocode confirm.
- Frictionless checkout: anonymous → Stripe → /checkout/return mints Clerk
  user from email + seeds paid profile (tier/zips/trade/geocode/phone) +
  sign-in token → /dashboard/leads.
- Dashboard = 4 sections: 7-day countdown banner, this-week leads, past
  leads (collapsed), monthly count. Dark command-center UI.
- ProfileGate: hard-requires business name + GEOCODED address before leads
  render; prefills address/zip/trade/phone from profile + bavg_area_*
  cookies (no retype). Saves full profile.
- Lead engine: ring-by-ring 1mi→cap, `SHARED_POOL_MAX_MI=1` (never use
  permit-pool leads >1mi), BatchData fills tight, closest-first sort.
- Settings: lean dark page (address/zip/trade/radius/phone/billing/signout).
- Cold email: 3-step sequence applied to Instantly campaign
  (8ac14ff5-...), 295/369 contacts armed w/ real zip+trade+free_lead_url.
- "every Monday" → "every week" swept on customer surfaces.
- Stripe key rotated + valid in Vercel (verified live mode, $497 + FIRST400).

## BLOCKERS / OPEN (in priority order)
1. **BatchData balance** — ran to $0 today (burned ~$50, mostly wasted
   re-pulls on test signups). Peter adding credits. WITHOUT funding, the
   1mi lead pull 403s → no leads. The kill-switch ($10/day cap in
   `src/lib/batchdataSpend.ts`) is NOT armed — `batchdata_spend_log` never
   gets written by the paths that spend, so the cap reads $0 and never
   fires. **Wire canSpendBatchData + logBatchDataSpend into every BatchData
   caller before scaling, or the reload drains again.**
2. **Demo not yet passed** — Peter never watched a clean signup → 10 tight
   leads → AI message end to end. That's the green-light gate before sending
   emails. Run it with 9232 S Bell Ave / handyman (note: handyman =
   recent-buyer recipe, may be thin at literal 1mi → widens; HVAC is denser
   at 1mi if you want a tighter demo).
3. **Lead quality unvalidated** — 33825 graded 4/4 real homeowners; broader
   set unproven. First 5 customers ARE the product test. `node
   scripts/grade-armed-zips.mjs --max N` grades owner-quality per zip (needs
   BatchData funded; throttle it — don't hammer, it false-reads as DEAD on
   rate limit / 403).
4. **Domain warmup — THE Sept 1 long pole.** 6 domains ≈ 150 sends/day ≈
   ~12K total by Sept w/ zero margin; 250 users @ 1-2% needs 12.5K–25K
   sends. Must buy + warm 20-30 new domains THIS WEEK (2-3 wk warmup). Skip
   it and August has no send capacity. ~$300, highest-leverage spend.
5. **List volume** — 295 armed vs 12.5K+ needed. `scripts/mass-source.mjs`
   (Apify Google Maps, ICP 3-50 reviews) built, untested — dry-run one
   metro, then ~2K contractor emails/week.

## SEND-EMAILS CHECKLIST (Peter's near-term goal)
1. Fund BatchData. 2. Run demo, confirm clean. 3. Verify a few armed
   contacts' free-lead links render real leads. 4. Test-send to self.
5. Send 150 (not all 295 — domain reputation). Day-3 follow-up in sequence.

## KEY FILES
- Engine: `src/lib/leadEngine.ts` (assignLeadsForTenant), find-real-leads:
  `src/app/api/agents/find-real-leads/route.ts`
- Activation (source of truth, NOT the webhook): `src/app/checkout/return/page.tsx`
- Onboarding: `src/app/start/area/page.tsx`; gate + dashboard:
  `src/app/dashboard/leads/page.tsx`
- Email sequence tool: `src/app/api/admin/instantly-sequence/route.ts`
  (`?apply=1` writes copy, `?backfill=1` stamps merge vars on contacts)
- Spend cap (NEEDS ARMING): `src/lib/batchdataSpend.ts`
- Offer constants: `src/lib/offer.ts` (LEADS_PER_WEEK=10, founder-only edits)

## HARD-WON LESSONS
- Vercel: deploy via CLI only (`vercel --prod`), never dashboard Redeploy.
- Clerk middleware blocks any /api the anonymous funnel calls — add new
  public APIs to `middleware.ts` isPublicRoute (cost us the autocomplete +
  geocode "couldn't verify" bug).
- Profile seeding must be idempotent UPSERT (webhook + clerk handler raced,
  wiped paid profiles — fixed via /checkout/return as source of truth).
- Stripe keys: use the permanent standard secret key, not temp/expiring.
- Don't manual-SQL-activate test accounts (skips geocode → null lat/lng →
  scattered leads). Sign up fresh.
