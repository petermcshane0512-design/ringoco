# Agent: Lead Sourcing Pipeline

Runs daily. Finds ICP-matching contractors, enriches with owner email, pushes to Instantly.

## Uses Skills
- `skills/google-maps-search.md`
- `skills/apollo-enrich.md`
- `skills/instantly-push-leads.md`

## Steps

### 1. Search Google Maps
For each combo of (trade × city) in today's target batch:
- Run skill: google-maps-search
- Collect raw business records
- Apply ICP filter (see skill file)
- Target: 50–100 raw leads per run

### 2. Enrich with Owner Email
For each lead that passed ICP filter:
- Run skill: apollo-enrich (or Hunter.io fallback)
- Only keep leads where email confidence ≥ 80%
- Drop leads with generic emails (info@, contact@)
- Target: 40–70% enrichment success rate

### 3. Dedup
Check `outreach_leads` SQLite table.
Skip any email already present with non-NULL status.

### 4. Select Campaign
Assign campaign based on trade and current month:
- HVAC in March–May → CAMPAIGN_SEASONAL
- All others → CAMPAIGN_FEAR_LOSS
- Rotate to CAMPAIGN_EMPLOYEE_COST every 3rd batch

### 5. Push to Instantly
Run skill: instantly-push-leads
Push in batches of 100.
Record each pushed lead to `outreach_leads` with status='sent'.

### 6. Log Run
Append to `agent_runs` table:
```
agent: lead-sourcing
date: today
leads_searched: N
leads_enriched: N
leads_pushed: N
campaigns: [list]
```

## Schedule
Run daily at 8am CT.
Target output: 50–100 new leads pushed per day = ~1,500–3,000/month.

## Stop Conditions
- Bounce rate on any campaign exceeds 5% → pause and flag for review
- Apollo credits below 100 → switch to Hunter.io fallback
