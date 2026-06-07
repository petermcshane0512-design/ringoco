-- 2026-06-07 — Creator nudge tracking + reactivation tracking
--
-- For /api/crons/creator-nudge: count + timestamp the graduated nudge
-- sequence to inactive creators (active_creator status, codes minted,
-- zero refs).
--
-- For /api/crons/reactivation-sweep: stamp when we last attempted to
-- re-engage a cancelled customer so we don't spam them.

ALTER TABLE ig_creator_outreach
  ADD COLUMN IF NOT EXISTS nudge_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_nudge_at  TIMESTAMPTZ;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reactivation_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reactivation_count        INTEGER NOT NULL DEFAULT 0;
