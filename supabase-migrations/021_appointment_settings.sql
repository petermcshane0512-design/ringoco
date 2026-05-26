-- BellAveGo Schema Migration 021 — Per-contractor appointment settings
--
-- Two new profile columns so the AI knows how long to block each booked job
-- and how much travel buffer to leave before/after every existing event.
-- These were previously stored ONLY on calendar_connections (per-connection),
-- which meant settings were missing until the customer connected a calendar.
-- Now they live on profiles → set during onboarding → applied to every
-- subsequent booking regardless of which calendar(s) are connected.
--
-- Defaults match the prior hardcoded behavior so nothing changes for
-- contractors who haven't visited the new settings UI:
--   default_job_duration_min = 90 (1.5 hour service call)
--   travel_buffer_min        = 30 (30 min before + after each event)
--
-- The availability + book routes read profile FIRST, then fall back to
-- the connection-level values, then to the hardcoded defaults.
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS default_job_duration_min integer DEFAULT 90,
  ADD COLUMN IF NOT EXISTS travel_buffer_min integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS appointment_settings_at timestamptz;

-- Bounds check — keep values sane so the AI can't book a 30-second slot or
-- a 24-hour slot due to bad data entry.
ALTER TABLE profiles
  ADD CONSTRAINT profiles_default_job_duration_min_chk
    CHECK (default_job_duration_min IS NULL OR (default_job_duration_min BETWEEN 15 AND 360))
  NOT VALID;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_travel_buffer_min_chk
    CHECK (travel_buffer_min IS NULL OR (travel_buffer_min BETWEEN 0 AND 120))
  NOT VALID;

-- Validate now that defaults are in place
ALTER TABLE profiles VALIDATE CONSTRAINT profiles_default_job_duration_min_chk;
ALTER TABLE profiles VALIDATE CONSTRAINT profiles_travel_buffer_min_chk;
