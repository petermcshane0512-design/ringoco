# Recipe Lab — Research Report (Terminal 2)

> **Hard scope rule.** Terminal 1 owns `find-real-leads`, `lead-engine`,
> `offer.ts`, and onboarding. This report + the files in `scripts/recipes/`
> are research only. Nothing here is imported by production code. Terminal 1
> reads this report and decides what to wire in next.

---

## What this lab produced

| File | Purpose |
|---|---|
| `recipe-definitions.ts` | Typed list of every candidate BatchData recipe + confidence + climate variant + honest data-gap notes. **The deliverable Terminal 1 reads.** |
| `probe-recipe.mjs` | Generic single-recipe prober. CLI: `--slug <recipe> --zip <5-digit>`. |
| `test-all-recipes.mjs` | Orchestrator. Full sweep = 12 active recipes × 25 zips = 300 probes. Dry-run first; `--commit` runs live. Ceiling ~$225 BatchData spend (only if every probe returns the full take). |
| `output/probe-results-{ISO}.json` | Raw per-probe rows written by the orchestrator. |

---

## Recipes shipped (definitions only — fill rate measured by orchestrator)

### HVAC (4 recipes, climate-stress tested)

| Slug | Climate | Window | Confidence | Notes |
|---|---|---|---|---|
| `hvac-mild-baseline` | mild | 1985–2005 | **high** | Current production recipe in `find-real-leads`. Correct for mild metros; verify before applying to hot. |
| `hvac-hot-climate` | hot | 2008–2015 | **high** | Hot-climate AC compressors fail at 10–15yr. Pre-2008 hot-metro homes have already replaced. |
| `hvac-hot-climate-tight` | hot | 2011–2014 | **high** | Narrow window for highest first-replacement intent. Lower volume, sharper signal. |
| `hvac-cold-climate` | cold | 1990–2008 | medium | Cold-climate gas furnaces last 18–25yr. BatchData has no heat-source filter — caveat captured in definition. |

**Climate stress-test result (definitional):** the single 1985–2005 window
in production today is **wrong for Phoenix / Vegas / Houston / Tampa**.
Those metros' AC compressors die before that window even starts. Probe
output (orchestrator JSON) confirms which window produces the highest
fill × intent per metro.

### Roofing (3 recipes)

| Slug | Window | Confidence | Notes |
|---|---|---|---|
| `roofing-asphalt-3tab` | built 2001–2011 (= 15–25yr-old roofs) | **high** | 3-tab asphalt 15–20yr life. |
| `roofing-architectural` | built 1996–2006 | medium | Architectural / dimensional shingles 25–30yr life. |
| `roofing-broad-overlay-storm` | built 1991–2016 | **high** | Broad pool joined against `noaa_storm_events`. Storm overlay is what qualifies; BatchData supplies the pool. |

**Data gap:** BatchData does not expose roof material or last-roof permit
date. Standalone recipes are age-only. The high-value play is the broad
window joined against the NOAA storm scraper Terminal 1 already runs.

### Plumbing (3 + 1 honest gap)

| Slug | Window | Confidence | Notes |
|---|---|---|---|
| `plumbing-galvanized` | 1900–1969 | **high** | Galvanized supply lines fail 40–60yr after install. |
| `plumbing-polybutylene` | 1978–1995 | **high** | Cox v. Shell class-action homes; mass-replacement market. |
| `plumbing-cast-iron-sewer` | 1900–1980 | medium | Drain-stack corrosion. Overlaps galvanized — dedupe required at orchestrator layer. |
| `plumbing-water-heater-PLACEHOLDER` | — | **data-thin** | **No BatchData signal exists for water-heater install year.** Recipe is intentionally empty. Do NOT pitch a water-heater-age claim without a real data source (utility-rebate registry, manufacturer warranty database, or city permit feed). |

### Electrical (2 + 1 honest gap)

| Slug | Window | Confidence | Notes |
|---|---|---|---|
| `electrical-pre-1980-panel` | 1900–1980 | medium | Pre-1980 builds disproportionately have 60–100A panels + insurance-flagged brands. Pure age proxy. |
| `electrical-fpe-aluminum-window` | 1965–1975 | **low** | Federal Pacific Stab-Lok + aluminum-wiring era. Recommend dropping in favour of the pre-1980 cut — same caveats, lower fill. |
| `electrical-ev-charger-PLACEHOLDER` | — | **data-thin** | EV-charger installs are driven by recent vehicle purchase + permit pull. **Belongs in the permit-scraper layer, not BatchData.** Marked here so the gap is visible. |

---

## How to actually run a sweep

```bash
# Dry-run first — shows probe count + cost ceiling, no API hits.
node scripts/recipes/test-all-recipes.mjs --dry-run

# HVAC-only sweep (climate stress test). 4 recipes × 25 zips = 100 probes, ~$75 ceiling.
node scripts/recipes/test-all-recipes.mjs --hvac-only --commit

# One metro across every trade. 12 recipes × 5 zips = 60 probes, ~$45 ceiling.
node scripts/recipes/test-all-recipes.mjs --metro Phoenix --commit

# One recipe, one zip — quickest live check. ~$0.75 max.
node scripts/recipes/probe-recipe.mjs --slug hvac-hot-climate --zip 85015

# Inspect the request payload only (no spend, no key needed).
node scripts/recipes/probe-recipe.mjs --slug hvac-hot-climate --zip 85015 --dry-run
```

**Smoke-tested** today via `--dry-run`: orchestrator reports 300 probes
across the 12 real recipes, ~$225 ceiling. Per-probe dry-run prints the
exact searchCriteria payload that would hit BatchData.

Output lands in `scripts/recipes/output/probe-results-{ISO}.json`. Fill
rates + sample properties per (recipe × zip).

---

## Recommendations for Terminal 1 (wire-in order)

1. **Adopt climate-aware HVAC recipe selection.** Replace the single
   1985–2005 window in `find-real-leads` with a metro→recipe lookup
   keyed off `zip_centroids.state` (hot states → `hvac-hot-climate`,
   cold states → `hvac-cold-climate`, rest → `hvac-mild-baseline`).
   Highest-leverage change in this report.

2. **Add the three real plumbing recipes** to `find-real-leads`.
   Plumbing currently has no recipe at all — galvanized + polybutylene
   + cast-iron-sewer are all high-confidence age-only filters with
   clean BatchData support.

3. **Add `roofing-broad-overlay-storm` and join against
   `noaa_storm_events`** in the lead-engine. Standalone roofing
   recipes are weak; the storm overlay is where roofing actually wins.

4. **Skip the two `*_PLACEHOLDER` recipes.** Don't ship water-heater-age
   or EV-charger pitches until partner data or a permit-feed join
   backs them. Pitching them without data = the honest-data rule
   violation that broke the receptionist pivot.

5. **Drop `electrical-fpe-aluminum-window` once the broader pre-1980
   recipe ships.** Same caveats, narrower window, no upside.

---

## Known limitations of this lab

- All recipes filter on `yearBuilt` because that's BatchData's
  highest-fidelity field. None can filter on roof material, panel
  brand, pipe material, or HVAC install year — those fields don't
  exist in property/search.
- Storm + permit signals live in our own scrapers, NOT in BatchData.
  The recipes that need overlays (roofing, EV) note this; Terminal 1
  joins them at the lead-engine layer.
- Climate buckets here are hot/mild/cold by state. A true
  climate-zone-aware version would use ASHRAE zones; state is the
  shippable approximation for v1.
- The 5 test zips per metro are deliberately spread across density
  brackets but were chosen by hand. If a metro has known scraper
  coverage gaps (per `offer.ts` — Phoenix scraper currently 0/wk),
  factor that into Terminal 1's adoption order.

---

## Out of scope (deliberately)

- No writes to `outreach_leads`, `leads`, or any production table.
- No changes to `find-real-leads`, `lead-engine`, `offer.ts`, or
  `src/app/onboarding/`.
- No new crons, no new Vercel deployments.
- No marketing copy updates (24-scout grid, homepage, cold email).
- No prospect-list scraping (Terminal 3 owns that — Chicago HVAC).

End of report.
