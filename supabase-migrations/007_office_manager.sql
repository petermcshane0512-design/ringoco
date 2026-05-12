-- BellAveGo Schema Migration 001
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql

-- ── profiles: add billing + onboarding columns ────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_metered_item_id text,
  ADD COLUMN IF NOT EXISTS plan_tier text DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS revenue_range text,
  ADD COLUMN IF NOT EXISTS team_size text,
  ADD COLUMN IF NOT EXISTS hours_open text,
  ADD COLUMN IF NOT EXISTS hours_close text,
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;

-- ── call_logs: add new columns to existing table ──────────────────────────────
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS profile_id text,
  ADD COLUMN IF NOT EXISTS call_sid text,
  ADD COLUMN IF NOT EXISTS booking_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hangup_turn integer,
  ADD COLUMN IF NOT EXISTS job_id uuid;

-- ── jobs: add scheduled_time column ──────────────────────────────────────────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS scheduled_time text;

-- ── invoices: add user_id ─────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS user_id text;

-- ── prompt_suggestions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text,
  suggestion text NOT NULL,
  based_on_call_count integer,
  applied boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── diagnostics ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text,
  business_name text,
  google_rating numeric(3,1),
  google_review_count integer,
  has_website boolean,
  estimated_missed_calls_per_month integer,
  estimated_monthly_roi integer,
  ai_summary text,
  raw_places_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- ── usage_events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text,
  call_sid text,
  duration_seconds integer,
  stripe_reported boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── outreach_leads ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  business_name text,
  owner_first_name text,
  city text,
  state text,
  trade text,
  campaign_id text,
  status text DEFAULT 'sent',
  pushed_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── outreach_replies ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_email text,
  campaign_id text,
  reply_body text,
  classification text,
  summary text,
  received_at timestamptz DEFAULT now()
);

-- ── outreach_objections ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_objections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objection_type text,
  objection_text text,
  trade text,
  city text,
  campaign_id text,
  received_at timestamptz DEFAULT now()
);

-- ── agent_runs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  leads_searched integer,
  leads_enriched integer,
  leads_pushed integer,
  campaigns text[],
  notes text,
  ran_at timestamptz DEFAULT now()
);

-- BellAveGo Schema Migration 002
-- Durable per-call conversation state for the Twilio voice route.
-- Replaces in-memory Map() that loses turns across Vercel serverless instances.
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql

CREATE TABLE IF NOT EXISTS call_state (
  call_sid text PRIMARY KEY,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  profile_id text,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_state_updated ON call_state (updated_at);

-- Optional housekeeping: drop rows older than 1 hour. Twilio calls don't last that long;
-- anything older is a stuck/abandoned call that won't resume.
-- Run this periodically or wire to a cron route.
-- DELETE FROM call_state WHERE updated_at < now() - interval '1 hour';

-- BellAveGo Schema Migration 003
-- Track whether the welcome SMS has been sent so we don't double-text on re-deliveries
-- of the same Stripe checkout.session.completed event (Stripe retries on 5xx).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS welcomed_at timestamptz;

-- BellAveGo Schema Migration 004
-- 1) Track job completion so we can fire post-job Google Review request SMS
-- 2) Track whether review request already sent (idempotent guard)
-- 3) Store Google Place ID for direct review-form deep link (fallback to search if null)
-- 4) Per-profile language flag for Spanish-mode AI receptionist (Premium feature)

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_requested_at timestamptz;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS google_place_id text,
  ADD COLUMN IF NOT EXISTS review_request_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_language text DEFAULT 'en';

CREATE INDEX IF NOT EXISTS idx_jobs_completed_review_pending
  ON jobs (completed_at)
  WHERE status = 'completed' AND review_requested_at IS NULL;

-- BellAveGo Schema Migration 005
-- Voice route now inserts a call_logs row at call inception (first webhook hit)
-- and upserts the same row by call_sid when booking completes. This gives us
-- "calls received this month" instead of just "jobs booked" — needed for the
-- Receptionist tier 50-call cap to count actual calls, not bookings.

-- Make call_sid unique so the upsert(... onConflict: 'call_sid') works.
-- Skipped if call_sid is already unique or has a unique index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'call_logs'
      AND indexdef LIKE '%UNIQUE%'
      AND indexdef LIKE '%call_sid%'
  ) THEN
    CREATE UNIQUE INDEX call_logs_call_sid_unique ON call_logs (call_sid);
  END IF;
END$$;

-- Index for the Receptionist tier cap query
-- (count rows for a user within current calendar month).
CREATE INDEX IF NOT EXISTS idx_call_logs_user_created
  ON call_logs (user_id, created_at);

-- BellAveGo Schema Migration 006
-- Post-checkout setup wizard state.
-- Each customer is walked through a tier-specific guided flow after Stripe success
-- (forwarding, test call, A2P, CRM, kickoff call) and we track where they are.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS setup_complete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_step integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forwarding_carrier text,           -- 'verizon' | 'att' | 'tmobile' | 'sprint' | 'other'
  ADD COLUMN IF NOT EXISTS forwarding_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_call_received boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS a2p_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS a2p_brand_sid text,
  ADD COLUMN IF NOT EXISTS crm_provider text,                  -- 'jobber' | 'housecallpro' | 'servicetitan' | 'none'
  ADD COLUMN IF NOT EXISTS crm_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS kickoff_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS custom_prompt_notes text;

-- Index for cron that follows up with stalled-onboarding customers
CREATE INDEX IF NOT EXISTS idx_profiles_setup_incomplete
  ON profiles (created_at)
  WHERE is_active = true AND setup_complete = false;
