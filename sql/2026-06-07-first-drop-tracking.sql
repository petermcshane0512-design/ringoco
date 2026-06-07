-- 2026-06-07 — First-drop tracking + 24h promise UX
--
-- Marketing copy now promises "5 leads within 24 hours of activation"
-- instead of "5 leads instantly." This buys us up to 24 hours of retry
-- budget if the day-1 discovery agent + lead engine miss (city scraper
-- broken, census-aging hasn't covered their ZIP yet, etc.). The daily
-- /api/crons/lead-engine cron at 10am UTC catches any tenant who
-- didn't get drops on signup.
--
-- We stamp first_lead_drop_at the moment the first lead drop assignment
-- succeeds; dashboard reads this to swap between countdown ("4h 23m
-- until your first drop") and the normal leads view.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_lead_drop_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_first_lead_drop_pending_idx
  ON profiles (created_at)
  WHERE first_lead_drop_at IS NULL AND is_active = true;
