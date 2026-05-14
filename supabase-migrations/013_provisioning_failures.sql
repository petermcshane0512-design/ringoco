-- BellAveGo Schema Migration 013 — Provisioning failure tracking
-- Backs the silent-failure recovery loop. When provisionNumberForUser throws
-- inside the Stripe webhook, we insert a row here, SMS Peter immediately, and
-- a half-hourly cron retries until success or 5 attempts (then escalates).
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

CREATE TABLE IF NOT EXISTS provisioning_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,                  -- one open failure per user; UPSERT on retry
  business_name text,
  owner_phone text,
  last_error text NOT NULL,
  attempts int DEFAULT 1 NOT NULL,
  status text DEFAULT 'pending' NOT NULL,        -- 'pending' | 'resolved' | 'manual_review'
  next_retry_at timestamptz DEFAULT now() NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provisioning_failures_status_retry
  ON provisioning_failures (status, next_retry_at)
  WHERE status = 'pending';
