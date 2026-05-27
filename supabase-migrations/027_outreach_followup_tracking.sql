-- BellAveGo Schema Migration 027 — Outreach follow-up tracking
--
-- Adds columns to outreach_leads so Peter can log every touch (call, text,
-- demo) per prospect. Excel-driven workflow: Peter updates rows during the
-- day, runs the import script at night, data flows back to DB. Next morning's
-- stats run includes the new touchpoints in the learning loop.
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

ALTER TABLE outreach_leads
  ADD COLUMN IF NOT EXISTS call_attempted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS call_outcome       text,    -- no_answer / voicemail / talked / interested / not_interested / hostile / wrong_number
  ADD COLUMN IF NOT EXISTS call_notes         text,
  ADD COLUMN IF NOT EXISTS text_opt_in_at     timestamptz,
  ADD COLUMN IF NOT EXISTS text_sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS text_response_at   timestamptz,
  ADD COLUMN IF NOT EXISTS text_response      text,
  ADD COLUMN IF NOT EXISTS demo_booked_at     timestamptz,
  ADD COLUMN IF NOT EXISTS demo_outcome       text,    -- showed / no_show / interested / not_a_fit
  ADD COLUMN IF NOT EXISTS trial_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at            timestamptz,
  ADD COLUMN IF NOT EXISTS plan_tier_signed   text,    -- receptionist / officemgr / concierge
  ADD COLUMN IF NOT EXISTS notes              text;

-- Index for the "who needs a follow-up call" view: shops that opened the
-- report but haven't been called yet.
CREATE INDEX IF NOT EXISTS idx_outreach_leads_followup_priority
  ON outreach_leads (call_attempted_at, updated_at DESC)
  WHERE call_attempted_at IS NULL;
