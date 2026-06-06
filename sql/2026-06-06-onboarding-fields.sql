-- 2026-06-06 — Onboarding deltas
--
-- Three new optional fields captured during onboarding:
--   business_description  — 1-sentence elevator pitch (≤140 chars).
--                            Vapi prompt builder injects into Emma's
--                            "what do you do?" answer. Lead pitch
--                            generator (Claude) references it for tone.
--   sub_trade             — free-text specialty inside the trade
--                            (e.g. "porches + decks" for handyman).
--                            Lead engine boosts candidates whose
--                            permit description matches.
--   min_ticket            — USD floor. Lead engine drops anything below.
--                            null = no filter. Stored as integer cents-free.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS business_description TEXT,
  ADD COLUMN IF NOT EXISTS sub_trade            TEXT,
  ADD COLUMN IF NOT EXISTS min_ticket           INTEGER;
