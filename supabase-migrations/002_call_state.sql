-- BellAveGo Schema Migration 002
-- Durable per-call conversation state for the Twilio voice route.
-- Replaces in-memory Map() that loses turns across Vercel serverless instances.
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql

CREATE TABLE IF NOT EXISTS call_state (
  call_sid text PRIMARY KEY,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  profile_id text,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_state_updated ON call_state (updated_at);

-- Optional housekeeping: drop rows older than 1 hour. Twilio calls don't last that long;
-- anything older is a stuck/abandoned call that won't resume.
-- Run this periodically or wire to a cron route.
-- DELETE FROM call_state WHERE updated_at < now() - interval '1 hour';
