# ICP — Tight Definition (90-day lock)

**Decision: HVAC ONLY for first 90 days.** Plumbing/electrical added Aug 2026 once we've closed 25 HVAC. No exceptions, no "but plumbing is similar."

## Why HVAC, Why Now

- **AC season starts now (May).** Call volume peaks June–August. Pain is acute today, not theoretical.
- HVAC owners spend more on tools/software than any trade. Avg $400/mo in marketing already.
- Highest avg job value of resi trades ($385/job per `business-diagnostic.md`) → easier ROI math.
- Failed AC = emergency. Customers don't tolerate voicemail. Missed call = lost job, immediately.

## Tight ICP (must hit 4 of 5)

| Filter | Target | How to verify |
|---|---|---|
| **Trade** | HVAC residential (no commercial-only) | Google Maps category + website "residential" copy |
| **Revenue** | $500K–$2M annual | 5–25 Google reviews per quarter as proxy; 2–10 trucks visible on website/Insta |
| **Geo** | DFW, Houston, Austin, Tampa, Orlando, Atlanta, Charlotte, Phoenix | warm-weather first (AC demand starts earlier) |
| **Tech-readiness** | Uses Jobber / Housecall Pro / ServiceTitan | Footer or "powered by" badge, or Capterra reviews |
| **Pain signal** | <50 reviews + responds to 0 of last 5 reviews, OR website says "call our office" but Google Maps shows no business hours after 5pm | manual eyeball or scrape |

## Disqualify (skip these — waste of time)

- 100+ employees → too big, has office staff
- 0 website OR purely Facebook page → too small, won't pay $797
- Owner's name is on every review reply → already engaged, won't switch
- Listed as franchise (Mr. Cool, One Hour, Aire Serv) → corporate makes decisions
- "We're hiring office manager" job posts within 30 days → already solving differently

## Decision Maker

**Title:** Owner / President / GM
**Age signal:** Apollo says 35–58
**Backgrounds that close fast:** former tech who started his own shop, second-gen owner who took over from dad, owner whose wife/mom currently answers phones (huge pain → relief)
**Backgrounds that resist:** old-school owner 60+ who's "always done it this way", or shops where owner's spouse is the office manager (political problem)

## Trigger Events (highest-intent signals)

1. Just hired a tech (means more capacity, more inbound calls coming)
2. Negative Google review mentioning "no one answered" or "couldn't reach"
3. Recent hiring post for "office manager" or "dispatcher" → they're feeling the pain
4. New service area expansion (FB post / website update) → growing
5. Just bought a new truck (Insta post) → growth mode

## Where They Hang Out

- **Facebook groups:** "HVAC Talk", "HVAC Owners United", "HVAC Business Owners"
- **Reddit:** r/hvacadvice (homeowners), r/HVAC (techs + owners)
- **Trade pubs:** ACHR News, Contracting Business, ACCA conferences
- **Podcasts:** Service Business Mastery, HVAC School, Hot Dawg
- **Trade shows:** AHR Expo (Jan), HVAC Excellence (Mar), Service World Expo (Sep)

## Source for Cold List (executable today)

1. **Google Maps Places API** — `skills/google-maps-search.md` — query `"hvac residential {city}"` w/ `establishment` type
2. **Apollo enrichment** — `skills/apollo-enrich.md` — title in `[owner, president, founder, CEO, GM]`
3. **Manual: Yelp top-10 lists per metro** — `"best HVAC {city}"` Yelp page → 10 names per metro free
4. **Permits filed** — public records (Open Permit, BuildZoom) for HVAC installs in last 90 days = active growing shops

## Anti-Pattern (do not target — yet)

- Med spas, dentists, law firms (different ICP, different pain, different sales cycle, different price tolerance)
- Cleaners, lawn care, pest control (lower job value → lower ROI math → harder close at $797)
- Multi-location franchises (custom sales motion — this is `Multi-location` tier, not core)
- Anyone outside US (no Twilio number, no Stripe US bank, opens compliance hell)
