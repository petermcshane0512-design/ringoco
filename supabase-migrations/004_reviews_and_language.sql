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
