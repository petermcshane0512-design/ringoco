-- Auto-booking controls on profiles
-- =====================================================================
-- Adds three columns so contractors can opt into AI-initiated calendar
-- bookings + restrict the time window the AI is allowed to book inside.
--
-- Defaults are SAFE: auto_booking_enabled = FALSE means even if a
-- contractor has a calendar connected (for their own visibility) the AI
-- will NOT offer slots or create events. Existing behavior for
-- pre-toggle accounts: opt them in manually after testing.
--
-- Usage:
--   - auto_booking_enabled = TRUE     → Emma may use check_availability
--                                       + book_appointment
--   - auto_booking_min_hour = 17      → only book at or after 5pm local
--   - auto_booking_max_hour = 21      → only book before 9pm local
--   - both NULL                       → no time restriction
--
-- "After hours only" example for a contractor who wants the AI to never
-- book during business hours: set min_hour=17, max_hour=23.
--
-- "Business hours only" example: set min_hour=8, max_hour=17.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auto_booking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_booking_min_hour SMALLINT,
  ADD COLUMN IF NOT EXISTS auto_booking_max_hour SMALLINT;

COMMENT ON COLUMN profiles.auto_booking_enabled IS
  'When TRUE, the AI receptionist (Emma) may offer real calendar slots and '
  'create calendar events via the book_appointment tool. When FALSE, the AI '
  'only takes callback messages even if a calendar is connected.';

COMMENT ON COLUMN profiles.auto_booking_min_hour IS
  'Optional minimum hour (0-23, local time) for AI-booked appointments. '
  'NULL = no restriction. Example: 17 = only book at or after 5pm.';

COMMENT ON COLUMN profiles.auto_booking_max_hour IS
  'Optional maximum hour (0-23, local time) for AI-booked appointments. '
  'NULL = no restriction. Example: 21 = only book before 9pm.';

-- Sanity check — print the updated schema so the migration runner can
-- confirm the columns landed.
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('auto_booking_enabled', 'auto_booking_min_hour', 'auto_booking_max_hour')
ORDER BY column_name;
