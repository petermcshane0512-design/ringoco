-- BellAveGo Schema Migration 019 — Web Push subscriptions
--
-- Stores the browser push subscription object so the backend can fire
-- notifications to the contractor's phone/desktop even when the dashboard
-- tab is closed. One row per profile — if the contractor reinstalls the
-- PWA, the new subscription overwrites the old one.
--
-- Subscription shape (from browser pushManager.subscribe()):
-- {
--   "endpoint": "https://fcm.googleapis.com/fcm/send/...",
--   "expirationTime": null,
--   "keys": { "p256dh": "...", "auth": "..." }
-- }
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_subscription jsonb,
  ADD COLUMN IF NOT EXISTS push_subscribed_at timestamptz;

-- Index for the rare "send push to every subscribed user" admin op (announcements).
CREATE INDEX IF NOT EXISTS idx_profiles_push_subscribed
  ON profiles (push_subscribed_at)
  WHERE push_subscription IS NOT NULL;
