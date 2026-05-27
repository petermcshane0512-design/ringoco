-- BellAveGo Schema Migration 026 — Sample report cache for cold email campaign
--
-- The /api/sample-report/personalize endpoint generates a personalized
-- ConsultingReport (~$0.04 of Sonnet + Places + Census per call). At 500-1000
-- cold emails/day, we cannot afford to regenerate the same report every time
-- a prospect opens their unique URL. We also want to:
--   1. Pre-generate reports at 2am for that day's sends (instant page load on click)
--   2. Track when each prospect first opens their report (cold email engagement)
--   3. Auto-expire stale reports (30 days) so re-engaged prospects get fresh data
--
-- The cache is keyed by (lower(business_name), zip) since those are the two
-- merge fields in the cold email URL. Token column provides an alternative
-- short URL form (/r/<token>) we can swap in later without schema changes.
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

CREATE TABLE IF NOT EXISTS sample_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'base64'),
  business_name   text NOT NULL,
  zip             text NOT NULL DEFAULT '',
  business_type   text NOT NULL DEFAULT 'HVAC',
  city            text,
  lead_email      text,
  campaign_id     text,
  report          jsonb NOT NULL,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  opened_at       timestamptz,
  last_opened_at  timestamptz,
  open_count      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Cache lookup: case-insensitive business name + zip pair.
-- Functional index because /sample-report?for=X&zip=Y normalizes via lower().
CREATE UNIQUE INDEX IF NOT EXISTS idx_sample_reports_cache_key
  ON sample_reports (lower(business_name), zip);

-- Short-URL lookup (future /r/<token> route).
CREATE INDEX IF NOT EXISTS idx_sample_reports_token
  ON sample_reports (token);

-- Cleanup job will sweep expired rows; index keeps that query cheap.
CREATE INDEX IF NOT EXISTS idx_sample_reports_expires
  ON sample_reports (expires_at)
  WHERE opened_at IS NULL;

-- Engagement analytics — "which campaigns are driving opens?"
CREATE INDEX IF NOT EXISTS idx_sample_reports_campaign
  ON sample_reports (campaign_id, opened_at DESC)
  WHERE campaign_id IS NOT NULL;
