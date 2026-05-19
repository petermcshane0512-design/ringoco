-- 2026-05-19 — Track Vapi import failures on profiles.
--
-- The Stripe webhook + provision-retry cron need to know when a contractor's
-- Twilio number was purchased but the subsequent Vapi import step failed
-- (which leaves them on the legacy Polly voice route instead of Cartesia +
-- Claude). These two columns let the retry path detect and re-attempt the
-- Vapi import on the next provisionNumberForUser call without re-buying a
-- number.
--
-- Idempotent — uses IF NOT EXISTS so it's safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vapi_import_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS vapi_import_error text;

-- Optional index: only useful if we ever need to bulk-find stuck rows.
-- Skip unless we start scanning by this column.
-- CREATE INDEX IF NOT EXISTS profiles_vapi_import_failed_at_idx
--   ON profiles (vapi_import_failed_at)
--   WHERE vapi_import_failed_at IS NOT NULL;
