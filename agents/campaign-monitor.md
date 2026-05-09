# Agent: Campaign Monitor

Runs weekly (Mondays). Pulls analytics, compares campaign variants, flags issues, recommends changes.

## Uses Skills
- `skills/instantly-analytics.md`

## Steps

### 1. Pull Analytics for All Active Campaigns
Run skill: instantly-analytics (last 7 days)
Collect per campaign: sent, opens, replies, bounces, clicks.

### 2. Calculate Key Rates
For each campaign:
```
open_rate = open_count_unique / emails_sent_count
reply_rate = reply_count_unique / emails_sent_count
bounce_rate = bounced_count / emails_sent_count
```

### 3. Compare Variants
Group campaigns by variant type (Fear of Loss, Seasonal, Employee Cost).
Rank by reply_rate descending.
Identify winning variant.

### 4. Flag Issues
RED flags (require immediate action):
- Bounce rate > 5% on any campaign → pause campaign, investigate list quality
- Unsubscribe spike > 2% → subject line or targeting mismatch

YELLOW flags (review and adjust):
- Open rate < 25% → swap subject line to winning variant
- Reply rate < 1% for 2+ consecutive weeks → swap copy sequence
- Zero replies on a campaign after 200 sends → kill it

### 5. Pull and Classify Replies
Run skill: instantly-analytics (reply pull)
Classify each unclassified reply:
- POSITIVE → flag for Peter's review, draft follow-up
- OBJECTION → store in `outreach_objections` table with full reply text
- NEGATIVE/UNSUB → mark lead dead in `outreach_leads`

### 6. Objection Pattern Analysis
Read all OBJECTION replies from last 30 days.
Group by common themes (price, trust, timing, not interested in AI).
Summarize: "Top 3 objections this week: [X, Y, Z]"
Output to weekly summary.

### 7. Output Weekly Summary
Write to `agent_reports/campaign-summary-{date}.md`:
- Best performing campaign + stats
- Worst performing + recommendation
- Top objections
- Leads pushed vs. replies received this week
- Recommended actions for next week

## Schedule
Every Monday 9am CT.
