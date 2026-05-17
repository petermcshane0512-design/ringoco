-- BellAveGo Schema Migration 019 — Calendar Connections
--
-- Per-contractor OAuth connections to external calendar providers so the
-- AI receptionist can read free/busy in real time and offer specific
-- appointment slots during a call.
--
-- Token storage: access_token + refresh_token are stored encrypted via
-- AES-256-GCM (see src/lib/calendar/tokens.ts). The raw DB columns hold
-- ciphertext+iv+tag concatenated — never the raw token.
--
-- One row per (user_id, provider). A contractor can connect multiple
-- providers (e.g. Google for personal + Housecall Pro for work) and we'll
-- merge availability across all enabled connections.
--
-- Read-only at launch — AI checks availability + offers slots but does NOT
-- create events. Auto-booking is Phase 2 (will add events table + write
-- scopes when shipped).
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

CREATE TABLE IF NOT EXISTS calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  provider text NOT NULL,                   -- 'google' | 'microsoft' | 'apple' | 'housecallpro' | 'jobber' | 'servicetitan' | 'calendly' | 'workiz' | 'fieldedge' | 'acuity'
  provider_account_email text,
  provider_account_name text,
  -- Encrypted token storage — format: hex(iv).hex(authTag).hex(ciphertext)
  access_token_enc text NOT NULL,
  refresh_token_enc text,
  token_expires_at timestamptz,
  scope text,
  -- Which calendar to use (Google: calendar ID like primary; HCP: account ID; etc.)
  calendar_id text,
  -- Business hours so AI doesn't offer 11pm slots. Format: {mon: [start_hr, end_hr], ...}
  business_hours jsonb DEFAULT '{"mon":[8,18],"tue":[8,18],"wed":[8,18],"thu":[8,18],"fri":[8,18],"sat":[9,14],"sun":null}'::jsonb,
  -- Default appointment length in minutes (AI uses this when slot length unknown)
  default_job_duration_min int DEFAULT 90,
  -- Buffer time between jobs (travel + breathing room)
  buffer_min int DEFAULT 30,
  timezone text DEFAULT 'America/Chicago',  -- IANA tz; updated from Google profile on first connect
  enabled boolean DEFAULT true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_calendar_connections_user
  ON calendar_connections (user_id) WHERE enabled = true;

-- Audit trail of OAuth events (connects/disconnects/refresh failures) so
-- we can debug if a contractor reports "the AI isn't seeing my calendar."
CREATE TABLE IF NOT EXISTS calendar_events_log (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  provider text NOT NULL,
  event text NOT NULL,                      -- 'connected' | 'disconnected' | 'refresh_ok' | 'refresh_failed' | 'availability_query' | 'error'
  detail text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user
  ON calendar_events_log (user_id, created_at DESC);
