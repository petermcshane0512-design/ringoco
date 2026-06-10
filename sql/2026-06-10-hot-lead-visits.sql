-- 2026-06-10 — Hot-lead visit tracking on prospect_free_leads.
--
-- Pivot context: cold email + IG DM out, email-only outbound in. Multi-visit
-- on a prospect's personalized /free-lead?b={biz_id} landing = explicit hot
-- intent. We SMS Peter the moment visit_count crosses the threshold so he
-- can call within minutes.
--
-- Single source of truth for "hot lead" definition: visit_count >= 2.

ALTER TABLE prospect_free_leads
  ADD COLUMN IF NOT EXISTS visit_count          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_visited_at      timestamptz,
  ADD COLUMN IF NOT EXISTS hot_call_sms_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS hot_call_dialed_at   timestamptz;

-- Index for the /admin/hot-leads dashboard sort (hot + not yet dialed first).
CREATE INDEX IF NOT EXISTS prospect_free_leads_hot_idx
  ON prospect_free_leads (hot_call_sms_sent_at DESC NULLS LAST)
  WHERE hot_call_sms_sent_at IS NOT NULL AND hot_call_dialed_at IS NULL;

COMMENT ON COLUMN prospect_free_leads.visit_count IS
  'Distinct human-button-press POST hits on /api/free-lead/generate. Incremented per call. Bot/scanner traffic excluded upstream.';
COMMENT ON COLUMN prospect_free_leads.hot_call_sms_sent_at IS
  'Stamped when visit_count crosses threshold (2). SMS goes to founder cell with biz_id + business_name + email + free-lead URL.';
COMMENT ON COLUMN prospect_free_leads.hot_call_dialed_at IS
  'Stamped by /admin/hot-leads when Peter clicks "called" — keeps the dashboard list pruned.';
