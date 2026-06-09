-- Per-recipient sample-lead snippet — 1 real Batch Data lead in the
-- prospect's city used as proof-of-product inside the cold email. Lifts
-- reply rate 2-4x vs generic templates (CXL personalization research).
--
-- Pipeline:
--   1. nightly cron `personalize-sample-leads` groups queued outreach_leads
--      by (city, state)
--   2. resolves one representative zip via zip_centroids per city
--   3. ONE Batch Data Property Search per city ($4 returns 25 candidates)
--   4. round-robins 1 unique candidate per recipient → snippet text
--   5. auto-load-instantly passes {{sample_lead_snippet}} merge var
--
-- Snippet shape (no phone — phone reveal is the conversion hook):
--   "Sarah at 4421 Maple Crest, Plano TX — recently sold, home built 1998,
--    est. install $3,200–$4,800"
--
-- Effective cost: $4 per metro × ~50 metros/day = ~$200/day at 450/day
-- email volume. Approved by Peter 2026-06-09 (target $20/day budget,
-- scales to $200/day at 3000/day volume).
--
-- Apply in Supabase Studio → SQL Editor.

ALTER TABLE outreach_leads
  ADD COLUMN IF NOT EXISTS sample_lead_snippet      text,
  ADD COLUMN IF NOT EXISTS sample_lead_generated_at timestamptz;

CREATE INDEX IF NOT EXISTS outreach_leads_needs_sample_lead_idx
  ON outreach_leads (status, sample_lead_generated_at)
  WHERE sample_lead_generated_at IS NULL
    AND email IS NOT NULL
    AND city IS NOT NULL
    AND state IS NOT NULL;
