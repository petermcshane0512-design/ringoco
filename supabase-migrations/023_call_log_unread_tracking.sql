-- BellAveGo Schema Migration 023 — Call log read/unread tracking
--
-- Push notifications + emails are transient. iOS clears Notification Center
-- after a few hours, contractor's email pile grows, and the only persistent
-- record of every call lived in the jobs table — which doesn't say "you
-- haven't looked at this yet."
--
-- This adds two columns so the dashboard can show a "Recent Activity" feed
-- with unread badges:
--   - viewed_at: when contractor opened this call's detail (null = unread)
--   - viewed_count: bumped every open; useful for "they checked 5 times"
--     follow-up patterns
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_count integer DEFAULT 0;

-- Partial index for the "unread for this user" query — fast even at 100K rows.
CREATE INDEX IF NOT EXISTS idx_call_logs_unread
  ON call_logs (user_id, created_at DESC)
  WHERE viewed_at IS NULL;
