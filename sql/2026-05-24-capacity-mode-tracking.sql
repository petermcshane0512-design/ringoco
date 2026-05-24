-- Capacity-mode tracking for call-cap enforcement
-- =====================================================================
-- Adds a column to profiles that records WHEN a contractor's Vapi
-- assistant was switched to "capacity mode" because they crossed
-- their monthly call cap.
--
--   capacity_mode_at TIMESTAMPTZ
--      NULL  = assistant is in normal mode, takes calls normally
--      SET   = assistant has been PATCHed to the capacity-mode
--              greeting + 30-second max duration; will be restored
--              by /api/crons/reset-monthly-caps on the 1st of next month
--
-- WHY THIS PATTERN
--   - We can't reuse the cap-check that used to live in
--     /api/vapi/assistant-request because that webhook is dead in the
--     per-tenant assistant world (Vapi skips the webhook when the
--     phone has an assistantId bound).
--   - Instead, /api/vapi/end-of-call-report runs the cap check after
--     each call ends. If now-over-cap, it PATCHes the assistant's
--     firstMessage + system prompt to capacity mode and stamps this
--     column.
--   - On the 1st of each month, the reset cron iterates rows where
--     capacity_mode_at IS NOT NULL, re-PATCHes the assistant to
--     normal mode (via repatchPerTenantAssistant), and clears the
--     column.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS — safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS capacity_mode_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.capacity_mode_at IS
  'Timestamp when this contractor''s per-tenant Vapi assistant was '
  'switched to capacity mode because they hit their monthly call cap. '
  'NULL = normal mode. Restored on the 1st of each month by '
  '/api/crons/reset-monthly-caps.';

-- Sanity check — should return 1 row
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name = 'capacity_mode_at';
