# Skill: Instantly — Push Leads to Campaign

Push enriched leads to an Instantly campaign via API v2.

## API
```
POST https://api.instantly.ai/api/v2/leads
Headers:
  Authorization: Bearer {INSTANTLY_API_KEY}
  Content-Type: application/json

Body:
{
  "email": "{owner_email}",
  "first_name": "{owner_first_name}",
  "campaign_id": "{campaign_id}",
  "custom_variables": {
    "business_name": "{business_name}",
    "city": "{city}",
    "trade": "{trade}",
    "review_count": "{review_count}"
  }
}
```

## Campaign IDs (update as campaigns are created)
- `CAMPAIGN_FEAR_LOSS` — "You already lost $2,800 this week" sequence
- `CAMPAIGN_SEASONAL` — Peak season urgency (use March–May for HVAC)
- `CAMPAIGN_EMPLOYEE_COST` — Receptionist comparison

## Deduplication
Before pushing: check local SQLite `outreach_leads` table for existing email.
Skip if `status` is not NULL (already in a campaign or responded).

## After Push — Record to DB
```sql
INSERT INTO outreach_leads 
  (email, business_name, city, trade, campaign_id, pushed_at, status)
VALUES (?, ?, ?, ?, ?, datetime('now'), 'sent')
```

## Batch Limits
- Max 100 leads per API call (use bulk endpoint for batches)
- Respect 40 emails/day/inbox limit downstream — do not push faster than infrastructure can send
