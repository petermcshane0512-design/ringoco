-- Per-contractor timezone — make it explicit, not implicit
-- =====================================================================
-- profiles.timezone existed in migration 009 but had no DEFAULT and was
-- never surfaced in the settings UI. As a result every contractor's
-- effective timezone was either:
--   (a) inherited from their calendar_connections row when present, or
--   (b) hardcoded 'America/Chicago' in routes that need a TZ before any
--       calendar is connected — see src/app/api/calendar/book/route.ts
--       and the contractor-facing email templates in src/lib/email.ts
--
-- This migration:
--   1. Backfills NULL profiles.timezone to 'America/Chicago' (safe default
--      since BellAveGo's existing accounts are all in CST).
--   2. Sets the column DEFAULT to 'America/Chicago' so new signups never
--      have NULL timezone — the settings UI will let contractors change
--      it during onboarding.
--   3. Documents the column purpose so future-me knows it's authoritative
--      for booking-window enforcement + email rendering, NOT calendar
--      API calls (those still use calendar_connections.timezone because
--      Google/Outlook want their own native value).
--
-- Idempotent — safe to re-run.

UPDATE profiles
   SET timezone = 'America/Chicago'
 WHERE timezone IS NULL;

ALTER TABLE profiles
  ALTER COLUMN timezone SET DEFAULT 'America/Chicago';

COMMENT ON COLUMN profiles.timezone IS
  'IANA timezone (e.g. America/Chicago, America/Phoenix) for THIS contractor. '
  'Authoritative for: auto-booking window enforcement, contractor-facing email '
  'render times, dashboard time displays. Calendar API calls use the '
  'per-connection calendar_connections.timezone separately. Default is '
  'America/Chicago; surfaced in dashboard/settings for contractor edit.';

SELECT
  (SELECT column_default FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'timezone') AS new_default,
  (SELECT COUNT(*) FROM profiles WHERE timezone IS NULL) AS still_null_should_be_zero,
  (SELECT COUNT(DISTINCT timezone) FROM profiles) AS distinct_tz_values;
