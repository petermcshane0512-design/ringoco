-- 2026-06-12 — pre-loaded AI outreach scripts (per Peter: "I want the AI
-- scripts for the reach outs to already be loaded up").
--
-- Messages are PER-TENANT (signed as the contractor's shop), so they live
-- on lead_drops (the tenant↔lead assignment), not on the shared leads row.
-- Written by /api/leads/list pre-generation and by
-- /api/leads/[id]/generate-message on regenerate.

ALTER TABLE lead_drops
  ADD COLUMN IF NOT EXISTS ai_sms text,
  ADD COLUMN IF NOT EXISTS ai_email_subject text,
  ADD COLUMN IF NOT EXISTS ai_email_body text,
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz;
