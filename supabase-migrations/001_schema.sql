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
