# Cold email template for the 450-prospect noon send

The 2.7% (12/450) conversion target requires every piece to compound. This doc is the playbook Peter loads into Instantly tomorrow morning.

## CSV format

File: `data/outreach-450.csv` (Peter populates from your scrape output)

```csv
biz_id,email,biz_name,firstname,trade,city,state,zip
0001,mike@planoheating.com,Plano Heating,Mike,HVAC,Plano,TX,75024
0002,sarah@lonestarroof.com,Lone Star Roofing,Sarah,Roofing,Plano,TX,75093
…
```

| Column | Purpose | Required |
|---|---|---|
| `biz_id` | Stable ID for attribution; appears in /free-lead?b={biz_id} | YES |
| `email` | Send-to address | YES |
| `biz_name` | `{biz_name}` Instantly variable | YES |
| `firstname` | `{firstname}` variable | YES |
| `trade` | Used by pre-pull script + email variant routing | YES |
| `city` / `state` | Display in `{city}` variable | YES |
| `zip` | Used by pre-pull script to find a matching lead | YES |

## Before send — RUN THIS ORDER

```bash
# 1. Pull env to local
vercel env pull .env.local

# 2. Diagnose Phoenix scraper first (T1 found 0 leads — fix before sending to AZ shops)
npx tsx scripts/diagnose-phoenix-scraper.ts

# 3. Backfill geocode for existing customers
npx tsx scripts/backfill-business-geocode.ts

# 4. Pre-pull a lead for EVERY prospect in CSV (this is the bait inventory)
npx tsx scripts/prepull-free-leads.ts data/outreach-450.csv

# 5. Verify count
psql via Supabase Studio:
  SELECT COUNT(*) FROM prospect_free_leads WHERE created_at > now() - interval '4 hours';
  -- should be ~450 (minus zero-inventory zips)
```

## Instantly campaign setup

**Send window:** 11:55am ICP local time, dripped at 15/min per warmed inbox (deliverability safe).

**Subject line A/B test (3 variants):**

```
A: {firstname}, pulled 1 homeowner in {zip}
B: {firstname} — your {trade} lead in {city} is ready
C: {biz_name} — 1 free lead, no catch
```

Instantly auto-allocates send % to highest-open variant after 100 sends per arm.

## Body — single variant, optimized for click-to-reveal

```
{firstname},

Pulled 1 real homeowner in {zip} for you. Permit / aged system / storm — yours to see in 30 sec, no signup needed.

[Get my free lead →] https://www.bellavego.com/free-lead?b={biz_id}

Yours regardless. The lead inside is a real owner + verified phone + the signal that surfaced them.

Want 40 leads like this in your area for $97? That's $2.42/lead — HomeAdvisor charges $40-300 shared with 4 other shops.

Tap the link to see your free one first. Decide after.

— Peter, BellAveGo
(773) 710-9565
```

**Why this body works:**
- Subject hooks open (specific + pattern interrupt)
- First line = the offer specificity (1 real lead in their exact zip)
- Single CTA (the link) — every additional choice costs 5% per Hormozi
- Below the link = the FRAME ($97 for 40 leads, $2.42/lead vs $40-300)
- "Yours regardless" removes signup-anxiety friction
- Founder signature + phone = trust signal

## Reply sequence (Instantly auto-follow-up)

If no reply / no click in 72 hours, Instantly fires:

**Follow-up 1 (Day 3, same thread):**
```
{firstname} — Did your free {trade} lead come through? Same link: https://www.bellavego.com/free-lead?b={biz_id}

Reply Y if you want me to pull another zip too.
```

**Follow-up 2 (Day 7, same thread):**
```
Last one — closing your {city} territory if no interest.

40 leads for $97: https://www.bellavego.com/start?promo=FIRST400&b={biz_id}

— Peter
```

## Reply-handler magic

The `/api/webhooks/instantly/reply` route now does the work for you:
- ANY reply (positive OR neutral) where the email matches a `prospect_free_leads` row AND `claimed_at IS NULL` → auto-sends the free-lead link as a 1-line reply via Instantly API
- POSITIVE intent → SMS Peter immediately at (773) 710-9565 with a 5-min response window
- NEGATIVE intent → silent (Peter doesn't get notified for "unsubscribe")

Requires `INSTANTLY_API_KEY` env var in Vercel.

## 4-hour retargeting cron

`/api/crons/free-lead-retarget?mode=list` returns the list of prospects who clicked the free-lead landing but didn't sign up in 4h. Two modes:
- `mode=list` → JSON list of prospects + ready-to-send email subject + body per retarget touch # (1/2/3)
- `mode=mark` → same + stamps `retargeted_at` and bumps `retarget_count` (use when actually firing)

Add to Vercel Cron (vercel.json):
```json
{ "path": "/api/crons/free-lead-retarget?mode=mark", "schedule": "0 * * * *" }
```

Hourly. Hormozi's 4-hour intent decay rule = no slower.

## Live dashboard query for monitoring tomorrow

In Supabase Studio after the send:

```sql
SELECT
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS total_sent,
  COUNT(*) FILTER (WHERE claimed_at > now() - interval '24 hours') AS landed,
  COUNT(*) FILTER (WHERE signed_up_at > now() - interval '24 hours') AS signed_up,
  ROUND(100.0 * COUNT(*) FILTER (WHERE claimed_at IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS land_rate_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE signed_up_at IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS signup_rate_pct
FROM prospect_free_leads
WHERE created_at > now() - interval '24 hours';
```

Target rates:
- land_rate_pct ≥ 10% (open + click)
- signup_rate_pct ≥ 2.7% (Hormozi target)

If land rate is good but signup rate is low → the LANDING page or offer is the friction.
If land rate is low → the EMAIL subject + body is the friction.

## Bottom line

12 signups out of 450 = $97 × 12 = $1,164 first-month revenue. Of those, ~40% stick into month 2 at $497 = $2,388/mo run-rate from one send.

Repeat every 3 days @ 450/send w/ new inboxes warming = 4-5x/week sends = $48k MRR by Day 30 if conversion holds.

## What can blow this up

1. **Phoenix scraper still dry** — AZ recipients get empty leads → brand-killer. Run diagnostic first. Don't send to AZ until fixed.
2. **Sender reputation tanks** — too many sends from new inboxes = spam folder. Stick to warmed inboxes only for the first batch.
3. **/free-lead landing breaks** — test the URL with a known good biz_id before send. https://www.bellavego.com/free-lead?b=test
4. **Stripe FIRST400 promo silently changed duration** — run `scripts/stripe-archive-orphan-prices.ts` to confirm coupon math still lands at $97.
