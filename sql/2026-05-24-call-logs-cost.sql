-- Per-call real cost (Vapi truth-source)
-- =====================================================================
-- Vapi's end-of-call-report payload includes a `cost` field reporting
-- what Vapi billed us for THIS specific call (bundled STT + LLM + TTS).
-- Storing it per-row gives the founder dashboard a truth-source for COGS
-- instead of the previous flat $0.30/call estimate, and lets us spot
-- expensive calls (multi-minute, capacity-mode misses, etc.) by sorting.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS — safe to re-run.

ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,4);

COMMENT ON COLUMN call_logs.cost_usd IS
  'Actual cost in USD that Vapi billed us for this call (STT + LLM + TTS '
  'bundled). Captured from message.cost in /api/vapi/end-of-call-report. '
  'Does NOT include downstream costs (Anthropic smart-insight, Twilio SMS, '
  'Resend email, Supabase write) — those add ~$0.02 per call on top.';

-- Sanity check
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'call_logs' AND column_name = 'cost_usd';
