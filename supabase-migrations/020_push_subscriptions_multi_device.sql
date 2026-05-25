-- BellAveGo Schema Migration 020 — Multi-device push subscriptions
--
-- Replaces the single-row profiles.push_subscription with a proper table
-- so a contractor can subscribe BOTH their laptop AND phone (and tablet,
-- and second phone, and...). Every captured lead fans out to all of
-- their registered devices.
--
-- Why this matters: if Mike enables push on his office laptop AND his
-- iPhone, he gets the alert on whichever device he's currently looking
-- at. Previous single-row design meant whichever device he subscribed
-- on LAST silently replaced the other one — he'd never see leads on
-- his laptop again once he set up his phone.
--
-- Backward compat: profiles.push_subscription stays — the push library
-- falls back to it if no rows exist in push_subscriptions for a user
-- (handles contractors who subscribed before this migration ran).
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  -- endpoint is unique per device — browser-generated, stable across sessions
  -- on the same device until the user clears site data or reinstalls the PWA.
  endpoint text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  -- Human-readable device hint derived from User-Agent at subscribe time
  -- (e.g. "iPhone Safari", "Chrome on macOS"). Lets the dashboard show
  -- contractors "you're getting alerts on 3 devices" with labels.
  device_label text,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_seen
  ON push_subscriptions(user_id, last_seen_at DESC);
