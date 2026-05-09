# Agent: Business Diagnostic (Onboarding)

Runs once per new contractor signup. Builds their profile from public data before they're live. Creates their baseline ROI report.

## Goal
Within 60 seconds of signup, show the contractor: "You're losing approximately $X/month to missed calls." Make it real and specific to their business — not generic.

## Uses Skills
- `skills/google-maps-search.md` (single business lookup)
- `skills/supabase-query.md`

## Inputs
From signup form:
- `business_name`
- `owner_phone`
- `trade` (HVAC / plumbing / electrical / etc.)
- `city`, `state`

## Steps

### 1. Pull Google My Business Data
Search Google Places API for their exact business:
```
GET /textsearch?query={business_name}+{city}+{state}
```
Extract:
- `review_count` — proxy for call volume
- `rating`
- `website` (if any)
- `hours` — are they claiming 24/7? If not, huge missed call opportunity
- `phone` — confirm matches what they gave us

### 2. Estimate Call Volume
Formula based on trade + review count:
```
monthly_calls_estimate = review_count * trade_call_multiplier

Trade multipliers (calls per review, industry averages):
  HVAC: 8.5
  Plumbing: 9.2
  Electrical: 7.8
  Landscaping: 4.1
  Pest Control: 6.3
```

### 3. Estimate Missed Calls
```
missed_calls_estimate = monthly_calls_estimate * 0.40  (conservative 40% miss rate)
after_hours_missed = monthly_calls_estimate * 0.42      (industry avg after-hours share)
```

### 4. Calculate Missed Revenue
```
avg_job_value = {trade_average}
  HVAC: $385, Plumbing: $310, Electrical: $290, Landscaping: $180

booking_rate = 0.55  (conservative)

monthly_missed_revenue = missed_calls_estimate * booking_rate * avg_job_value
annual_missed_revenue = monthly_missed_revenue * 12
```

### 5. Save Diagnostic to Supabase
```sql
INSERT INTO diagnostics
  (user_id, review_count, estimated_monthly_calls, 
   estimated_missed_calls, estimated_missed_revenue_monthly,
   avg_job_value_used, created_at)
```

### 6. Display to Contractor (Dashboard — first login)
Show a card:
```
Based on your {review_count} Google reviews and your trade,
we estimate you receive ~{monthly_calls} calls/month.
At a 40% miss rate, that's ~{missed_calls} missed calls/month.
At ${avg_job_value} average job value, you're losing an estimated
${monthly_missed_revenue}/month — ${annual_missed_revenue}/year.

BellAveGo costs ${their_plan_price}/month.
That's a projected {ROI}:1 return in year one.
```

### 7. Baseline for Future Reports
This diagnostic becomes month 0 of their revenue intelligence report.
Every month compare actual Stripe invoice data vs. this estimate.
Show the delta: "You've recovered $X of your estimated $Y monthly loss."
