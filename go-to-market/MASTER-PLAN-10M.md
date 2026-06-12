# BellAveGo — Master Plan to $10M ARR by May 12, 2027

*Authored 2026-06-12 (Fable). Operating frameworks: Elon's 5-Step Algorithm
(primary) + Hormozi (offer, scarcity, speed-to-lead). Every decision below
runs through: question → delete → simplify → accelerate → automate.*

---

## THE ONE-SENTENCE COMPANY

**We give home-service contractors exclusive leads of homeowners who are
legally or financially FORCED to do the work — and haven't done it yet —
so the contractor just calls and closes.**

Not "more leads." *Court-ordered / insurance-forced demand, exclusive to
one contractor per territory.* No competitor sells this.

---

## WHY THIS WINS (the unfair advantages)

1. **The leads are pre-sold by the government / insurer.** A homeowner under
   a city repair order or insurance non-renewal isn't "maybe interested" —
   they must act. Highest-intent lead that exists.
2. **The data is free; the product isn't.** City violation records cost $0.
   The product = finding them + matching to trade + skip-tracing the phone
   (not public) + filtering to NOT-yet-fixed + exclusivity + (soon) AI
   chase. We sell 20 hours of work the contractor can't do from a roof.
3. **Exclusivity = premium + sticky.** One lead, one contractor, one
   territory. Cancel and a competitor takes your turf. That's the moat
   ANGI/HomeAdvisor structurally cannot copy (their model is shared leads).
4. **Specificity at scale.** Every cold email carries the recipient's OWN
   trade + OWN zip + a REAL number ("X cited near you in 60 days"). Reads
   as truth, not spam.

---

## THE NUMBERS TO $10M

$10M ARR ÷ $497/mo ≈ **1,675 customers** (lead tier only). Brutal on cold
email alone. The arithmetic only closes if **revenue-per-customer rises**
and **channels stack**. Three levers:

| Lever | Effect |
|---|---|
| Enforcement + AI-chase tier @ $997 | Doubles ARPU → ~850 customers for $10M, not 1,675 |
| À-la-carte ($25/lead, appointment fees) | +20-40% ARPU |
| Geographic expansion (exclusivity caps each metro → hundreds of metros) | Removes the supply ceiling |

**Realistic landing: $3-5M ARR by May 2027. Bull case (phase 3-4 hit early): $10M.**
Either funds the life and the exit. We run it like the bull case is real.

---

## THE EXCLUSIVITY / SUPPLY MODEL (the thing that makes it sane)

- Product = **exclusive territory** (zips), not raw leads.
- A lead is **claimed the instant it drops to anyone** — never re-delivered (shipped 2026-06-12).
- Each metro+trade has a **seat cap** set by real lead supply
  (Chicago roofing ≈ 60-90 violations/wk ÷ 10 leads/customer ≈ ~8 seats).
- Scale = **MORE METROS, not more density.** 8 roofing + 8 masonry seats ×
  hundreds of metros = thousands of customers, zero oversell.
- Scarcity is the pitch (Hormozi): *"8 roofer seats in Chicago. 3 left."*

---

## PHASES (Algorithm-ordered — prove before automating)

### Phase 0 — PROVE THE MESSAGE (now → ~2 weeks)
- **Tomorrow: blast 450** Chicago roofers + masons across 15 warmed
  mailboxes (6 domains, 30/mailbox), enforcement message, real per-zip stats.
- Manually onboard first ~8-12. Cap by hand (spreadsheet), no code.
- Read reply-rate vs to-paid SEPARATELY. Target signal: ≥2% reply.
- **Gate to Phase 1:** message converts + first customers renew month 2.

### Phase 1 — PROTECT THE PROMISE (wk 1-3, parallel)
- ✅ Exclusivity lock (done)
- **Never-repeat suppression** (done this build) — a business emailed once
  is never emailed again, ever. Permanent suppression list.
- **Freshness sweep** — resolved violations drop off so no one calls a
  homeowner who already fixed it.
- **Territory cap + waitlist** at signup (build when seat 6 fills).

### Phase 2 — THE LEARNING LOOP (wk 2-4) — "constant improvement every day"
- Tag every send `trade × city × urgency_tier × subject_variant`.
- Nightly agent reads opens/replies/trials/paids by tag → reallocates next
  day's 450 to winners, kills losers, mutates subject lines.
- Conversion compounds daily without human input. (Repo already has
  variant-generator / variant-scorer / outreach-learner crons to wire in.)

### Phase 3 — DOUBLE ARPU (month 2-3) — the $10M unlock
- **AI auto-chase** (Twilio, mostly built): drops lead → AI texts/emails as
  the contractor → contractor's phone buzzes only on a reply.
- **$997 "AI Office Manager" tier**: enforcement leads + auto-chase. ARPU
  doubles. This is what makes the customer count to $10M achievable.
- **FL insurance roof-age engine** — the national forced-buyer dataset
  (county appraiser roof year + permit gap). Bigger than enforcement.

### Phase 4 — STACK CHANNELS (month 4-8)
- Referral engine (free month per referred shop).
- Paid ads using cold-email-PROVEN copy + Google LSA-style targeting.
- Appointment-based pricing ($25-50/booked appointment) on top of base.

### Phase 5 — SCALE TO RUN-RATE (month 8-11)
- Learning loop reallocates spend to highest-converting trade×city nationwide.
- New metro = config, not code. Roll out 2-3/week.
- Target run-rate: $6-10M ARR.

---

## THE OUTREACH MACHINE (how tomorrow becomes automatic)

```
Apify (find contractors, mass-source.mjs)
  → outreach_leads (status=sourced) [email UNIQUE + never-repeat suppression]
  → zip-stats merge vars (real "X cited near you")
  → Instantly (3-step sequence, enforcement message)
  → opens/replies tracked → learning loop
  → 2+ visit / reply = HOT → SMS Peter → Peter calls + closes
  → checkout → exclusive territory claimed → enforcement leads delivered weekly
```

Peter's only jobs (his choice): **website look + closing hot leads on the phone.**
Everything else automated on the Algorithm.

---

## NON-NEGOTIABLES (never break these)

1. **Never email the same business twice.** Permanent suppression. (built)
2. **Never share a lead with two customers.** Exclusivity lock. (built)
3. **Never deliver an already-fixed lead.** Freshness sweep. (this week)
4. **Never spend ahead of revenue beyond ~$10/metro list-building.**
   Phone traces only on paying customers' drops.
5. **Specificity always.** Every email = their trade, their zip, a real number.
6. **Scarcity always.** Limited seats per metro. Never "sign up everyone."

---

## TOMORROW'S SEND — EXACT TARGET

- **Who:** ~450 Chicago-metro roofing + masonry/tuckpointing shops (spread
  across all metro + collar-suburb zips so territories don't cluster).
- **Why these two trades:** heaviest-cited in Chicago building violations;
  big tickets; Chicago is a brick city → tuckpointing violations everywhere.
- **Message:** work-removed framing ("we do the digging, you make one call,
  they already have to say yes"), real per-zip stat merged, exclusive
  8-seat scarcity. Never the word "public."
- **Volume:** 450 across 15 warmed mailboxes @ 30 each.
- **Tracking:** every send tagged for the learning loop from email #1.
