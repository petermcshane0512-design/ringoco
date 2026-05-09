-- BellAveGo Schema Migration 001
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- ── Add columns to profiles ──────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_metered_item_id text,
  ADD COLUMN IF NOT EXISTS plan_tier text DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- ── call_logs ────────────────────────────────────────────────────────────────
-- Every call handled by the AI. Replaces in-memory Map.
CREATE TABLE IF NOT EXISTS call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id),
  call_sid text UNIQUE NOT NULL,
  caller_phone text,
  called_number text,
  duration_seconds integer,
  transcript jsonb DEFAULT '[]',
  booking_completed boolean DEFAULT false,
  job_id uuid REFERENCES jobs(id),
  hangup_turn integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_logs_profile_id_idx ON call_logs(profile_id);
CREATE INDEX IF NOT EXISTS call_logs_created_at_idx ON call_logs(created_at DESC);

-- ── usage_events ─────────────────────────────────────────────────────────────
-- Per-call billing events. Reported to Stripe metered billing.
CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id),
  call_sid text,
  duration_seconds integer,
  stripe_reported boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_profile_id_idx ON usage_events(profile_id);
CREATE INDEX IF NOT EXISTS usage_events_stripe_reported_idx ON usage_events(stripe_reported);

-- ── prompt_suggestions ───────────────────────────────────────────────────────
-- AI-generated suggestions for improving per-contractor system prompts.
-- Reviewed weekly, applied manually.
CREATE TABLE IF NOT EXISTS prompt_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id),
  suggestion text NOT NULL,
  based_on_call_count integer,
  applied boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── diagnostics ──────────────────────────────────────────────────────────────
-- Business diagnostic run on signup. Month-0 baseline for ROI tracking.
CREATE TABLE IF NOT EXISTS diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id),
  review_count integer,
  estimated_monthly_calls integer,
  estimated_missed_calls integer,
  estimated_missed_revenue_monthly numeric(10,2),
  avg_job_value_used numeric(10,2),
  created_at timestamptz DEFAULT now()
);

-- ── outreach_leads ───────────────────────────────────────────────────────────
-- Leads pushed to Instantly campaigns.
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

CREATE INDEX IF NOT EXISTS outreach_leads_status_idx ON outreach_leads(status);
CREATE INDEX IF NOT EXISTS outreach_leads_email_idx ON outreach_leads(email);

-- ── outreach_replies ─────────────────────────────────────────────────────────
-- Classified replies from Instantly campaigns.
CREATE TABLE IF NOT EXISTS outreach_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_email text REFERENCES outreach_leads(email),
  campaign_id text,
  reply_body text,
  classification text,
  summary text,
  received_at timestamptz DEFAULT now()
);

-- ── outreach_objections ──────────────────────────────────────────────────────
-- Objection training data extracted from replies.
CREATE TABLE IF NOT EXISTS outreach_objections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objection_type text,
  objection_text text,
  trade text,
  city text,
  campaign_id text,
  received_at timestamptz DEFAULT now()
);

-- ── Add user_id to invoices (if not already present) ────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS user_id text;

-- ── agent_runs ───────────────────────────────────────────────────────────────
-- Log of autonomous agent executions for monitoring.
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
