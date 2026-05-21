-- Review request SMS: explicit opt-in by default (TCPA safety)
-- =====================================================================
-- Previous schema (migrations 004 + 007):
--   ALTER TABLE profiles ADD COLUMN review_request_enabled boolean DEFAULT true
--
-- Issue: TCPA + general SMS deliverability hygiene require explicit opt-in
-- per contractor before any marketing-flavored SMS goes to a homeowner.
-- A brand-new account should NOT auto-send "leave us a Google review" texts
-- until the contractor has affirmatively turned the feature on.
--
-- Code-side change in src/app/api/crons/review-requests/route.ts tightens
-- the check from `=== false` to `!== true`, so NULL, false, and undefined
-- all skip. This migration removes any NULL rows that exist today and
-- flips the default for any future row.
--
-- Existing TRUE rows are intentionally NOT flipped — at current scale
-- (Peter + test profiles only) those are known opt-ins. Once paying
-- customers exist this script would need a different stance, but for
-- now grandfathering TRUE rows is correct.

UPDATE profiles
   SET review_request_enabled = FALSE
 WHERE review_request_enabled IS NULL;

ALTER TABLE profiles
  ALTER COLUMN review_request_enabled SET DEFAULT FALSE;

COMMENT ON COLUMN profiles.review_request_enabled IS
  'When TRUE, the hourly review-requests cron SMSes homeowners ~4 hours '
  'after a job is marked completed. Default FALSE for TCPA / opt-in safety: '
  'contractor must affirmatively enable this in dashboard settings before '
  'any SMS is sent. Cron check uses !== true so NULL is also treated as off.';

-- Sanity check — confirms default + row counts post-migration.
SELECT
  (SELECT column_default FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'review_request_enabled') AS new_default,
  (SELECT COUNT(*) FROM profiles WHERE review_request_enabled = TRUE)  AS opted_in,
  (SELECT COUNT(*) FROM profiles WHERE review_request_enabled = FALSE) AS opted_out,
  (SELECT COUNT(*) FROM profiles WHERE review_request_enabled IS NULL) AS still_null_should_be_zero;
