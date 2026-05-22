-- First-call celebration column
-- =====================================================================
-- Adds first_call_at to profiles so we can fire a one-time celebration
-- SMS + email when a contractor's AI receptionist takes its very first
-- inbound call. The field doubles as a churn-signal marker: contractors
-- whose first_call_at is null > 14 days after signup never set up
-- forwarding correctly and need a rescue nudge.
--
-- Set atomically via UPDATE ... WHERE first_call_at IS NULL inside the
-- Vapi end-of-call-report handler so the celebration fires exactly once
-- even under concurrent calls.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_call_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.first_call_at IS
  'Timestamp of the contractor''s first inbound call captured by the AI '
  'receptionist. Set once and never updated. NULL = AI has never answered '
  'a real call for this contractor yet. Used to fire one-time celebration '
  'notifications + as a churn-risk signal in the lifecycle cron.';

-- Sanity check
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'first_call_at';
