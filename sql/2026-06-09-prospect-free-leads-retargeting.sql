-- 2026-06-09 — add retargeting attribution columns to prospect_free_leads.
-- Apply AFTER sql/2026-06-09-prospect-free-leads.sql.
--
-- These let the 4-hour retargeting cron know which prospects to chase:
--   - retargeted_at  : last time we sent a retargeting email
--   - retarget_count : how many retargeting touches sent (cap at 3)
-- And the Stripe webhook attribution path:
--   - source_campaign / source_inbox : Instantly campaign + inbox (analytics)

ALTER TABLE prospect_free_leads
  ADD COLUMN IF NOT EXISTS retargeted_at timestamptz,
  ADD COLUMN IF NOT EXISTS retarget_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_campaign text,
  ADD COLUMN IF NOT EXISTS source_inbox text;

-- Index for the retargeting cron's WHERE clause
CREATE INDEX IF NOT EXISTS prospect_free_leads_retarget_idx
  ON prospect_free_leads (claimed_at, signed_up_at, retargeted_at)
  WHERE claimed_at IS NOT NULL AND signed_up_at IS NULL;
