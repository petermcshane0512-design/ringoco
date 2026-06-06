-- 2026-06-06 — Skip-trace enrichment columns on leads
--
-- BatchData skip-trace fills the gap where permit + property-record
-- scrapers populate address but not homeowner phone. Each successful
-- lookup costs ~$0.10. We cache the result so the same address isn't
-- re-traced twice within the 60-day refresh window.
--
-- Hit rate ~55-70% on US residential.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS skip_trace_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skip_trace_hit          BOOLEAN,
  ADD COLUMN IF NOT EXISTS skip_trace_raw          JSONB,
  ADD COLUMN IF NOT EXISTS skip_trace_cost_cents   INTEGER NOT NULL DEFAULT 0;

-- Fast filter for "leads needing a fresh skip-trace" in the enrichment cron.
CREATE INDEX IF NOT EXISTS leads_skip_trace_attempted_idx
  ON leads (skip_trace_attempted_at)
  WHERE skip_trace_attempted_at IS NULL OR skip_trace_hit = false;
