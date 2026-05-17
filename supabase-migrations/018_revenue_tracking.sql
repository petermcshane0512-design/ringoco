-- BellAveGo Schema Migration 018 — Revenue Capture (the consulting-report fuel)
--
-- Two-source revenue tracking so consulting reports always populate:
--   1. amount         (real, when contractor reports it via SMS or dashboard)
--   2. amount_estimated (trade-average ticket, pre-filled on job creation)
--
-- The daily revenue-followup cron SMSes the contractor 5+ days after each
-- job asking "what did this come to?" Their reply parses to amount + sets
-- revenue_source='reported'. If they reply 'skip', we set revenue_skipped=true
-- and never ask again — the estimate stays as the fallback.
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS amount_estimated numeric,
  ADD COLUMN IF NOT EXISTS revenue_asked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revenue_skipped boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS revenue_source text;
  -- revenue_source values: 'reported' | 'estimated' | 'stripe' | null

-- Per-contractor kill switch for revenue asks (texted 'STOP REVENUE')
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS revenue_asks_disabled boolean DEFAULT false;

-- The cron scans this every day; partial index keeps it fast at scale.
CREATE INDEX IF NOT EXISTS idx_jobs_revenue_due
  ON jobs (user_id, created_at)
  WHERE amount IS NULL AND revenue_skipped = false AND revenue_asked_at IS NULL;

-- Also index the "most-recent-asked-but-unreported" lookup used by the
-- inbound SMS parser to match a $ reply to the right job.
CREATE INDEX IF NOT EXISTS idx_jobs_revenue_pending_reply
  ON jobs (user_id, revenue_asked_at DESC)
  WHERE amount IS NULL AND revenue_skipped = false AND revenue_asked_at IS NOT NULL;
