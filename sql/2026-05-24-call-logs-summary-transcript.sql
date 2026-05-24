-- Add missing call_logs columns required by /api/vapi/end-of-call-report
-- =====================================================================
-- Production schema for call_logs was missing `summary` and `transcript`.
-- The Vapi webhook writes both on every call (text from Vapi's
-- end-of-call-report message). Without these columns, every upsert
-- silently fails with "Could not find the X column of call_logs in the
-- schema cache" and the row is dropped — even though Vapi answered the
-- call, no record lands in our DB. Symptom: dashboard "Calls Answered
-- Today" stays at 0 forever.
--
-- Paired with the serverUrl www-fix (commit 977160a) and the lazy
-- self-heal in handleToolCalls (commit 1eccf61), this is the third leg
-- of the "why our DB never sees real calls" stool.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS — safe to re-run.
-- Run order: anytime. No data backfill needed (backfill endpoint
-- /api/admin/backfill-vapi-calls already writes the minimum required
-- fields; once these columns exist, future webhooks write the rest).

ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS summary TEXT;

ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS transcript TEXT;

COMMENT ON COLUMN call_logs.summary IS
  'AI-generated call summary from Vapi (message.summary / message.analysis.summary). '
  'Plain text, usually 1-3 sentences. Used in the dashboard call-log drawer and '
  'in consulting reports as a "recent calls" excerpt.';

COMMENT ON COLUMN call_logs.transcript IS
  'Full call transcript. Either a plain-text string (Vapi message.transcript) or '
  'a JSON-serialized array of turn-by-turn messages. Up to ~50KB per call. Used '
  'for prompt-improvement cron + manual debugging.';

-- Sanity check — both rows should come back
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'call_logs'
  AND column_name IN ('summary', 'transcript')
ORDER BY column_name;
