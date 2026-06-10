-- 2026-06-10 — Free-lead protections per Fable 5 architectural review.
--
-- Three protections:
--   1. Per-biz_id generation dedup (one BatchData spend per prospect)
--   2. Daily spend cap tracking (kill switch when balance is at risk)
--   3. Empty-result attribution (so we know when to expand scrape sources)

-- Add generation-state columns to prospect_free_leads. Replaces the
-- "we always pre-pull" assumption with "we lazy-generate on human click".
ALTER TABLE prospect_free_leads
  ADD COLUMN IF NOT EXISTS generation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS generation_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS generation_failed_reason text,
  ADD COLUMN IF NOT EXISTS bot_clicks_blocked int DEFAULT 0;

-- Daily BatchData spend log. Per-route cron writes a row each successful
-- BatchData call. The /api/free-lead/generate route checks today's total
-- before firing, refuses if over the cap.
CREATE TABLE IF NOT EXISTS batchdata_spend_log (
  id           bigserial PRIMARY KEY,
  spent_at     timestamptz DEFAULT now(),
  cost_cents   int NOT NULL,
  caller       text NOT NULL,     -- e.g. 'free-lead-generate' / 'find-real-leads' / 'skip-trace-on-paid'
  context      jsonb,             -- { biz_id, user_id, zip, trade, result_count } — diagnostic
  result_ok    boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS batchdata_spend_log_spent_at_idx ON batchdata_spend_log (spent_at);
CREATE INDEX IF NOT EXISTS batchdata_spend_log_caller_idx ON batchdata_spend_log (caller, spent_at);

COMMENT ON TABLE batchdata_spend_log IS 'Every BatchData API call we pay for. Daily spend cap enforced by summing cost_cents WHERE spent_at > now() - 24h.';
COMMENT ON COLUMN prospect_free_leads.generation_requested_at IS 'Stamped when a human clicked Generate. NULL = never clicked.';
COMMENT ON COLUMN prospect_free_leads.generation_completed_at IS 'Stamped when BatchData returned + we have a lead to show. NULL until success.';
COMMENT ON COLUMN prospect_free_leads.generation_failed_reason IS 'NULL on success. Set when BatchData returned 0 OR spend cap hit OR bot blocked.';
COMMENT ON COLUMN prospect_free_leads.bot_clicks_blocked IS 'Count of scanner / bot clicks we refused to generate for. Monitoring metric.';
