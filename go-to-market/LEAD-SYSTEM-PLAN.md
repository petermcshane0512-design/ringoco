# BellAveGo Lead System Plan — 2026-06-11 (Fable)

Two machines. Don't confuse them:

- **Machine A — get customers:** Apify (find contractors) → Instantly (cold email them)
- **Machine B — the product:** multi-source homeowner lead engine (what customers pay for)

---

## MACHINE A — Apify → Instantly contractor acquisition

### Current state
- 295/369 contacts armed in Instantly campaign `8ac14ff5-…` w/ real zip + trade + free_lead_url merge vars
- 3-step sequence applied
- 6 burner domains ≈ 150 sends/day ceiling
- `scripts/mass-source.mjs` built — dry-run fired 2026-06-11 (Phoenix HVAC)

### The math that rules everything
250 users by Sept 1 @ 1–2% email→customer = **12,500–25,000 sends needed**.
6 domains × 25/day × 80 send-days ≈ 12K — zero margin, assumes no burn.

**→ Decision: buy 20–30 domains THIS WEEK (~$300). 2–3 week warmup. Skip this and August has no send capacity. Highest-leverage $300 in the company.**

### Sourcing cadence (after demo passes — that's the gate)
| Week | Action | Volume |
|---|---|---|
| Now | Domain purchase + warmup start; dry-run validate mass-source | 0 sends |
| W1 | Send 150 of the 295 armed (not all — reputation). Day-3 follow-up fires from sequence | 150 |
| W1–2 | mass-source: 5 metros × hvac (Phoenix, Tampa, Dallas, Atlanta, Houston) | +1.5–2K contacts |
| W3+ | New domains come online. Scale to 2K contacts/week, all 24 Sun Belt cities × 5 trades | 500–900 sends/day |

### Targeting upgrade — the highest-ROI list nobody scrapes
Review-count ICP filter (3–50) is good. Better: **shops already paying for leads.**
- Scrape Thumbtack / Angi pro directories per metro (Apify actors exist) → these shops have PRE-VALIDATED willingness to pay for leads. Cold email: "You're paying Thumbtack $80/lead shared with 4 shops. Ours are $12, exclusive, 1 mile from you."
- Google LSA advertisers per metro query ("ac repair near me") → same logic.
- Cross-ref with review-count filter. A 20-review shop running LSA = perfect ICP: hungry + paying + small.

### Copy law (from cold-email learnings)
Lead with the FREE LEAD (show, don't tell) — free_lead_url already does this. The market's scar tissue is HomeAdvisor; differentiator (exclusive + 1-mile + verified phone) must appear in sentence one, not the CTA.

---

## MACHINE B — homeowner lead engine ("best in the nation")

### Principle (Idiot Index applied)
BatchData property-age inference = $0.05/property for a WEAK signal ("house built 1995, HVAC probably old"). Event-driven public records = ~$0 for a STRONG signal ("permit filed Tuesday", "hail hit this street Thursday", "closed on the house last week"). **The moat is stacking cheap strong signals, not buying more weak ones.**

### Source stack, ranked by signal strength ÷ cost
| # | Source | Signal | Cost | Status |
|---|---|---|---|---|
| 1 | **Building permits** | Active project NOW — strongest possible | ~free (city portals: Accela/OpenGov/Socrata; most Sun Belt metros publish) | Have: Chicago, Austin, Orlando. **Expand to all 24 cities** |
| 2 | **Storm/hail swaths** | Roof/HVAC damage this week, insurance window open | Free (NOAA SWDI hail + wind data) | Have basic storm source. **Wire NOAA polygon → zip mapping** |
| 3 | **Property turnover (new owner)** | Buys everything in first 12 mo | BatchData quicklist (current) OR county deed records free | Live via BatchData |
| 4 | **System age inference** | "Probably aging" — weakest | BatchData $0.05/prop | Live — current workhorse. Demote to gap-filler as 1–3 scale |
| 5 | **Code violations** | Deferred maintenance, must-fix | Free (city open data) | Not built. Cheap add per metro |
| 6 | **Expired/FSBO listings** | Pre-sale fix-up spend | Scrape | Later |
| 7 | **First-party intent** — homepage opportunity-checker, free-lead clicks | Visitor IS the demand signal | $0 | Live — feeds hot-lead-call flow. Expand: every free-lead page visit per zip = market-demand heat map |

NOT doing: Meta/IG anything (Business Manager restriction — paid ads only, later), data co-ops, insurance claim data (legal swamp).

### Why this stack wins vs Angi/Networx
They sell FORMS (homeowner filled a form, sold to 4+ shops). We sell EVENTS (permit, storm, deed) exclusive to one shop, with verified phone + AI outreach. Different supply chain entirely — theirs costs $40+/lead to acquire (ad spend), ours costs cents (public records + $0.10 skip-trace). Idiot Index on their model: ~10x. On ours: ~2x. That gap IS the business.

### Build order (Algorithm step 4 — only accelerate what survived)
1. **Nothing new until demo passes + 5 paying customers.** Current engine (BatchData + 3-city permits) suffices for first ~50 customers.
2. Then: permit scrapers for the top-signup metros only (build where customers actually are).
3. Then: NOAA storm-swath cron (one source covers every metro at once — biggest leverage).
4. Code violations + deed records per metro, demand-driven.

### Guardrails (armed 2026-06-11)
- BatchData spend cap now enforced at EVERY call site (lib-level gate in `skipTrace.ts` + `homeowner-lookup.ts`; was: only 2 of 6 paths). $10/day default, `BATCHDATA_DAILY_CAP_USD` env override.
- Throttle `grade-armed-zips.mjs` — rate-limit 403s false-read as DEAD zips.
