-- 025_multi_provider_sync.sql
-- =====================================================================
-- Multi-provider outbound sync: a BellAveGo appointment can be mirrored
-- to BOTH Google Calendar AND Microsoft Outlook simultaneously. Up until
-- now we stored only one external_event_id + external_provider, which
-- forced an either/or choice.
--
-- Adds:
--   microsoft_event_id  TEXT  — Outlook event id (peer to legacy google_event_id)
--
-- Notes:
--   - `google_event_id`     already exists from earlier migrations.
--   - `external_event_id` + `external_provider` are kept for backward-compat
--     and treated as "primary provider mirror" by older code; new code
--     reads/writes the per-provider columns.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS microsoft_event_id TEXT;

-- Helpful index for cancellation cleanup (find jobs by external id)
CREATE INDEX IF NOT EXISTS idx_jobs_microsoft_event_id
  ON jobs (microsoft_event_id)
  WHERE microsoft_event_id IS NOT NULL;
