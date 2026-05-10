-- BellAveGo Schema Migration 005
-- Voice route now inserts a call_logs row at call inception (first webhook hit)
-- and upserts the same row by call_sid when booking completes. This gives us
-- "calls received this month" instead of just "jobs booked" — needed for the
-- Receptionist tier 50-call cap to count actual calls, not bookings.

-- Make call_sid unique so the upsert(... onConflict: 'call_sid') works.
-- Skipped if call_sid is already unique or has a unique index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'call_logs'
      AND indexdef LIKE '%UNIQUE%'
      AND indexdef LIKE '%call_sid%'
  ) THEN
    CREATE UNIQUE INDEX call_logs_call_sid_unique ON call_logs (call_sid);
  END IF;
END$$;

-- Index for the Receptionist tier cap query
-- (count rows for a user within current calendar month).
CREATE INDEX IF NOT EXISTS idx_call_logs_user_created
  ON call_logs (user_id, created_at);
