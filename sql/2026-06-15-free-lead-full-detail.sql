-- 2026-06-15 — free lead = complete, callable lead (per Peter).
-- Adds the homeowner's real city/state/zip to the cache so cached leads stop
-- showing the CONTRACTOR's location (the Dallas/Chicago mislabel), and lets
-- the free lead carry the full phone instead of a redacted one.

ALTER TABLE prospect_free_leads ADD COLUMN IF NOT EXISTS lead_city  text;
ALTER TABLE prospect_free_leads ADD COLUMN IF NOT EXISTS lead_state text;
ALTER TABLE prospect_free_leads ADD COLUMN IF NOT EXISTS lead_zip   text;
-- 2026-06-15 — AI lead packet (job breakdown + outreach script + why-you pitch
-- + property note), generated once at free-lead time, cached on the row.
ALTER TABLE prospect_free_leads ADD COLUMN IF NOT EXISTS lead_ai_intel jsonb;

-- Force every already-cached free lead to REGENERATE on next view, so the
-- 50-odd leads stored with a redacted phone + wrong city get rebuilt with the
-- full phone + correct homeowner location.
UPDATE prospect_free_leads
SET generation_completed_at = NULL
WHERE generation_completed_at IS NOT NULL;
