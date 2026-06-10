# Lead supply measurement — 2026-06-09

Per Task 1 of the offer-rebuild plan. Script: `scripts/measure-lead-supply.ts`.

## Method

Queried Supabase `leads` table for the last 6 weeks. Grouped by ZIP prefix → metro and ISO week. "Qualified" = `lead_score >= 70`. Total rows in window: **29,422**.

## Real numbers (qualified leads ≥ score 70)

| Metro | Wks observed | Total qualified | Avg/wk | /wk @ 1 cust | /wk @ 5 cust | /wk @ 10 cust |
|---|---|---|---|---|---|---|
| **Chicago IL** | 1 | 155 | 155 | 155 | 31 | **15.5** |
| Phoenix AZ | 0 | 0 | 0 | 0 | 0 | **0** |
| Dallas-Fort Worth TX | 0 | 0 | 0 | 0 | 0 | 0 |
| Austin TX | 0 | 0 | 0 | 0 | 0 | 0 |
| Atlanta GA | 0 | 0 | 0 | 0 | 0 | 0 |
| Orlando FL | 0 | 0 | 0 | 0 | 0 | 0 |
| Miami FL | 0 | 0 | 0 | 0 | 0 | 0 |
| Nashville TN | 0 | 0 | 0 | 0 | 0 | 0 |
| Houston TX | 0 | 0 | 0 | 0 | 0 | 0 |
| Northeast (010xx-034xx ZIP) | 1 | ~700 total across 25 prefixes | 12-54/prefix | — | — | — |

## Trade distribution (qualified)

| Trade | Count |
|---|---|
| roofing | 838 |
| hvac | 832 |
| plumbing | 821 |
| **handyman** | **77** |
| **electrical** | **73** |

## Key findings

### 🚨 Phoenix has ZERO qualified leads in last 6 weeks

The founder named Phoenix as the success-metric metro. The data shows the Phoenix permit scraper has not produced ANY qualified leads in 42 days. Either:
- Scraper not running for Phoenix (check `/api/crons/scrape-permits-phoenix` last successful run)
- Scraper running but no zip prefix `850-853` hits
- `lead_score` threshold filtering everything below 70

Action: confirm before any LEADS_PER_WEEK recommendation tied to Phoenix promise.

### 🚨 Only 1 week of data observed per metro

Despite querying a 42-day window, every metro shows only 1 week of leads. Either:
- The lead engine just started populating
- `created_at` field is being overwritten on touch
- Older leads were purged in a cleanup

This makes a true 4-6 week trend impossible. Recommendation is based on the most recent observed week only.

### 🚨 Most leads are in Northeast ZIPs (010xx-034xx)

Boston/Hartford/Providence/etc. cluster has ~700 qualified leads in the latest observed week, scattered across 25 small zip prefixes. NOT in any of the metros currently named in the founder's growth plan (Sun Belt cities).

### 🚨 Electrical + Handyman trades have almost no qualified leads

73 electrical + 77 handyman qualified leads in the entire 6-week window. Marketing the product to electrical/handyman shops sets up a guaranteed empty-dashboard experience for them.

## Capacity math (recommended LEADS_PER_WEEK)

| Promise | Per-customer Phoenix capacity TODAY | Verdict |
|---|---|---|
| 40 leads/wk | 0 leads/wk available | **IMPOSSIBLE** — Phoenix dry |
| 10 leads/wk | 0 leads/wk available | **IMPOSSIBLE** — Phoenix dry |
| 5 leads/wk | 0 leads/wk available | **IMPOSSIBLE** — Phoenix dry |
| ANY lead promise tied to Phoenix | 0 leads/wk available | **CANNOT DELIVER** |

For metros WITH inventory (Chicago + Northeast clusters):

| Promise | Sustains @ 1 cust | Sustains @ 5 cust | Sustains @ 10 cust |
|---|---|---|---|
| 40 leads/wk | Chicago only (155/wk avail) | Nowhere (would need 200/wk/metro) | Nowhere (would need 400/wk/metro) |
| **10 leads/wk** | **Chicago + ~12 Northeast prefixes** | **Chicago only** (just barely) | **Nowhere** sustainably |
| **5 leads/wk** | **All current zips** | **Chicago + few Northeast** | **Chicago only** sustainably |

## Recommendation

**LEADS_PER_WEEK = 5**

`// PETER: CONFIRM BEFORE DEPLOY — data shows current scraper output sustains 5/wk reliably at single-customer-per-zip density. Phoenix is at 0/wk; need scraper diagnostic before marketing Phoenix. To raise to 10/wk you need: (a) Phoenix scraper fix, (b) 2-3x permit scraper expansion across Sun Belt, (c) handyman + electrical scrape sources unlocked.`

## Pre-deploy unblockers

Before bumping LEADS_PER_WEEK above 5:
1. Run `node --inspect src/app/api/crons/scrape-permits-phoenix/route.ts` directly — see if it errors or returns empty
2. Inspect `tenant_lead_quota_usage` for the `weeks observed: 1` anomaly — were older weeks purged?
3. Backfill 4-6 weeks of historical Phoenix scrape (replay permit data from `apify` dataset if retained)
4. Run a separate lead-supply measurement on `outreach_leads` table (this query was only `leads`) — that's where actual SENDABLE leads live

## Open questions for Peter

1. **Is Phoenix supposed to be live yet?** If yes, scraper is broken. If no, why is it in the marketing copy?
2. **Is the 1-week-only observation real or a `created_at` overwrite bug?**
3. **Are handyman/electrical contractors a real target ICP?** Data says no inventory.
4. **What's the actual customer-to-metro density today?** (Affects /5 vs /10 cust column.)
