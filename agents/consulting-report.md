# Agent: Quarterly AI Consulting Report

Generates a 1-page BellAveGo-branded PDF report per customer per quarter (+ welcome report on day 1). The "moat" feature — what justifies our pricing vs Rosie/Goodcall.

## When it runs

- **Welcome report:** day 1 of subscription activation
- **Quarterly:** every 90 days from welcome
- 5 reports/year per customer (welcome + Q1–Q4)

## Code paths

- **Type schema:** `src/lib/consultingReport.ts` (`ConsultingReport` type + `SAMPLE_REPORT` reference)
- **Generation API:** `POST /api/agents/consulting-report` — accepts `{ meta, performance, marketScan, competitive, bellaveScore }`, calls Claude Sonnet with the structured prompt, returns a complete `ConsultingReport`
- **Public sample render:** `src/app/sample-report/page.tsx` (route: `/sample-report`)
- **Marketing surface:** `src/app/page.tsx` consulting section links here

## Uses Skills

- `skills/supabase-query.md` — pull customer call/job data
- (planned) `skills/google-places-search.md` — pull competitor data by ZIP

## Steps

### 1. Pick customers due for a report

```sql
SELECT user_id, business_name, owner_phone, twilio_number, zip_code, created_at
FROM profiles
WHERE is_active = true
  AND (
    -- never received a report
    user_id NOT IN (SELECT profile_id FROM consulting_reports)
    OR
    -- last report > 85 days ago (gives 5-day buffer before "quarterly" expires)
    user_id IN (
      SELECT profile_id FROM consulting_reports
      GROUP BY profile_id
      HAVING MAX(created_at) < now() - interval '85 days'
    )
  )
LIMIT 25;
```

### 2. Pull internal metrics (last 90 days per customer)

For each customer, compute from `call_logs` and `jobs`:
- `calls_received` — count of call_logs
- `calls_answered` — count where booking_completed = true
- `answer_rate` — calls_answered / calls_received
- `jobs_booked` — count of jobs created in window
- `jobs_completed` — count where status='completed'
- `total_revenue` — sum of jobs.amount where status='completed'
- `avg_job_value` — total_revenue / jobs_completed
- `peak_unanswered_hour` — hour-of-week with highest count(call_logs WHERE booking_completed = false)
- `top_job_type` — most common jobs.job_type

### 3. Pull market context (Google Places)

For each customer's `zip_code`:
- Search `${trade} near ${zip}` (e.g., "plumbing near 30309")
- Pull top 20 results with: name, rating, review_count, distance
- Compute: competitor_count, avg_competitor_rating, top_3_named, customer's_rank

(Until Google Places API key is configured, use placeholder market data tied to the customer's business_type.)

### 4. Compute BellAveGo Score (1–10 composite)

```
score =
  (answer_rate * 25) +
  (booking_conversion * 30) +
  (response_time_factor * 15) +
  (avg_job_value_relative_to_market * 30)
```

Each component normalized to 0–10. Final composite rounded to 1 decimal.

### 5. Generate narrative + recommendation via Claude Sonnet

Prompt: send all metrics + market data + business profile to Claude. Ask for ONE specific, data-driven recommendation in 2–3 sentences. Examples:
- "Block 2–4pm Tuesdays — that's your peak unanswered window AND your highest-value job type (HVAC) clusters there. Adding capacity here = $4,200/mo additional revenue at current close rates."
- "Your average water-heater install ($720) is 14% below the local market median ($840). Raising base price 8% on this single job type adds ~$1,800/mo without affecting volume."

### 6. Render PDF via @react-pdf/renderer

Use `lib/generateReport.tsx`. BellAveGo-themed layout (teal #0AA89F, dark #0B1F3A). 1 page, 5 sections.

### 7. Upload + Email

- Upload PDF to Supabase Storage (`consulting-reports/{user_id}/{report_id}.pdf`)
- Email via Resend with PDF attachment + dashboard link
- Insert into `consulting_reports` table

### 8. Log run

Append to `agent_runs`:
```
agent: consulting-report
date: today
customers_processed: N
reports_generated: N
errors: [...]
```

## Schedule

Daily at 4am CT. Limit 25 customers per run (avoid overwhelming Claude/Resend rate limits at scale).

## Stop conditions

- Claude API errors > 10% in a run → halt, alert
- Email bounce rate > 5% → halt, alert
- Google Places API quota exhausted → use cached/placeholder data, continue

## Cost per report (May 2026 prices)

- Claude Sonnet 4.6 generation: ~$0.05
- Google Places API: ~$0.017
- Resend email: ~$0.0008
- PDF render compute: ~$0.001 (Vercel)
- **Total: ~$0.07 per report. 5/year × 500 customers = $175/year.**
