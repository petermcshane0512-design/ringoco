# LEAD PULL CONFIG — Week 1 Batch

**Target:** 500 enriched leads in Instantly by Friday.
**Tooling:** existing skills `google-maps-search` → `apollo-enrich` → `instantly-push-leads` (chain via `agents/lead-sourcing.md`).

---

## BATCH A — Monday (target 100 leads)

| Trade | City | State | Expected raw | After ICP filter | Enriched |
|---|---|---|---|---|---|
| HVAC | Dallas | TX | 200 | 80 | 50 |
| HVAC | Tampa | FL | 150 | 60 | 35 |
| HVAC | Phoenix | AZ | 180 | 70 | 45 |

Run command (PowerShell, from ringoco/ root):
```powershell
node scripts/run-agent.js lead-sourcing --trade=hvac --cities=dallas-tx,tampa-fl,phoenix-az --campaign=CAMPAIGN_FEAR_LOSS --max-leads=130
```

[If `scripts/run-agent.js` doesn't exist yet — that's another reason not to over-rely on automation. Manual fallback below.]

### Manual Fallback (if scripts not wired)

1. Open Google Maps. Search `HVAC contractor Dallas TX`. Scroll until 200+ results.
2. Pull names + phones into spreadsheet (use Maps scraper extension if available, else copy/paste top 50/city).
3. For each, run thru Apollo manually OR use bulk upload via Apollo CSV import:
   - Apollo → Search → Companies → Filter by name list
   - Add titles: Owner, President, Founder, GM, CEO
   - Bulk reveal emails (only ≥80% confidence)
4. Export CSV → Upload to Instantly campaign `CAMPAIGN_FEAR_LOSS`

**Time:** 90 min if scripts work, 4 hours manual.

---

## BATCH B — Tuesday (target 100 leads)

| Trade | City | State |
|---|---|---|
| HVAC | Houston | TX |
| HVAC | Orlando | FL |
| HVAC | Atlanta | GA |

---

## BATCH C — Wednesday (target 100)

| Trade | City | State |
|---|---|---|
| HVAC | Austin | TX |
| HVAC | Charlotte | NC |
| HVAC | Miami | FL |

---

## BATCH D — Thursday (target 100)

| Trade | City | State |
|---|---|---|
| HVAC | Nashville | TN |
| HVAC | Las Vegas | NV |
| HVAC | San Antonio | TX |

---

## BATCH E — Friday (target 100, top-quality)

Manual curation. Pull from:
- ACCA member directory (https://www.acca.org)
- Trane Comfort Specialist directory
- Yelp top-10 lists per metro (10 metros × 10 = 100 names)

These are higher quality (vetted by industry) but lower volume. Worth the manual effort.

---

## ICP FILTER — Apply ruthlessly

Per `01-icp.md`. Reject any lead where:
- More than 100 reviews (too big)
- Less than 5 reviews (too small / too new)
- Franchise (Mr. Cool, One Hour, Aire Serv, Service Experts)
- Commercial-only HVAC
- No website OR Facebook-only presence
- No verified Apollo email

---

## DEDUP

Before upload to Instantly, check `outreach_leads` table:
```sql
SELECT email FROM outreach_leads WHERE email IN (...new_batch_emails)
```
Skip any matches.

---

## EXPECTED FUNNEL — WEEK 1

```
Raw leads pulled:        500
After ICP filter:        200  (40%)
After Apollo enrichment: 120  (60% enrichment success)
After dedup:             115
Pushed to Instantly:     115
```

After Instantly sequence sends (Tue-Thu of week 2):
```
Emails opened:           ~58 (50% open rate, target)
Replies (any):            ~6 (5% reply, target)
Positive replies:         ~3 (3%)
Demos booked:             ~1-2
```

**1-2 demos from week 1 batch.** Add ~3 more from cold calls. Total target: 5 demos in week 2.

---

## SCALING — WEEKS 2-4

Once Batch A through E are flowing:
- Add 100/day ongoing (= 500/week → 2,000/month)
- Maintain 80%+ ICP match rate (don't dilute)
- Add 2nd campaign `CAMPAIGN_SEASONAL` for variety after week 2
- Add 3rd campaign `CAMPAIGN_EMPLOYEE_COST` after week 4

By month 3: 6,000 leads in pipeline, 60-90 demos booked, 12-18 customers closed.
By month 12: 24K leads, 240-360 demos, 50-75 customers (path to $300-500K ARR).

**To hit $1M ARR:** scale outreach 3x by month 6, OR raise concierge tier ARPU from $497 to $797 avg, OR hire SDR. Re-evaluate at month 3.

---

## INSTANTLY SETUP — DO BEFORE FIRST PUSH

Inboxes:
- Have at least 5 warm sending inboxes (peter@bellavego.com, peter@bellaveago.com, etc.)
- Each warmed 30+ days at >85% deliverability
- 40 emails/day/inbox = 200/day capacity

Domain warmth check: https://glockapps.com or Mailreach.

Campaign setup:
1. Create campaign exactly named `CAMPAIGN_FEAR_LOSS`
2. Paste 5 emails from `03-cold-email-fear-loss.md`
3. Days: 0, 3, 7, 12, 21
4. Send window: Tue/Wed/Thu, 9–11am recipient TZ
5. Stop on reply (yes), stop on click (no — let warm leads click multiple times)
6. Webhook: `https://www.bellavego.com/api/agents/reply-handler` (matches `agents/reply-handler.md`)

---

## RISK FLAGS

- **Domain burn:** if any domain hits >2% bounce rate, pull it offline immediately. Replace w fresh.
- **Apollo cost:** $0.05-0.10/lead × 500/wk = $25-50/wk. Stay under $200/mo Apollo until customer #5.
- **Twilio number:** demo number on landing page = `+17652371335` (or whichever is live). Monitor: if 50+ inbound demo calls/day, scale to dedicated demo line + voicemail trap.

---

## WHAT TO LOG (per batch)

Append row to `agent_runs` per `agents/lead-sourcing.md`:
```
{
  agent: 'lead-sourcing',
  date: '2026-05-11',
  trade: 'hvac',
  cities: ['dallas-tx', 'tampa-fl', 'phoenix-az'],
  raw_pulled: 530,
  after_icp: 198,
  enriched: 117,
  pushed_to_instantly: 115,
  campaign: 'CAMPAIGN_FEAR_LOSS',
  apollo_credits_spent: 198,
  cost_usd: 19.80
}
```

Daily standup w urself: read yesterday's row before today's batch. If something dropped (enrichment success, ICP match), diagnose before proceeding.
