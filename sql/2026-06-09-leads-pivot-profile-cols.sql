-- Profile columns required for the 2026-06-09 leads-only pivot.
-- Apply in Supabase Studio → SQL Editor → run once.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS owner_last_name      text,
  ADD COLUMN IF NOT EXISTS job_types            text[],
  ADD COLUMN IF NOT EXISTS min_job_value_cents  int,
  ADD COLUMN IF NOT EXISTS years_in_business    int,
  ADD COLUMN IF NOT EXISTS value_props          text[],
  ADD COLUMN IF NOT EXISTS outreach_tone        text,
  ADD COLUMN IF NOT EXISTS outreach_prompt_template text;

-- outreach_leads schema for personalized_opener was created earlier
-- (sql/2026-06-08-outreach-personalized-opener.sql). Apply that one
-- too if not already.
