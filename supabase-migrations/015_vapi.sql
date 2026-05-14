-- BellAveGo Schema Migration 015 — Vapi voice provider
--
-- Vapi is the new AI receptionist (replaces the legacy Polly+Haiku flow on
-- /api/twilio/voice). Twilio numbers are imported into Vapi via /phone-number,
-- which returns a Vapi phone-number record id. We persist that id so we can
-- look up / update the Vapi resource later (e.g. on tier changes, cancellation,
-- A2P-related re-imports).
--
-- See VAPI-SETUP.md for the full architecture + setup script.
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vapi_phone_number_id text;
