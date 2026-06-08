-- 2026-06-08 — Rolling per-tenant 7-day lead drop cadence
--
-- Replaces fixed Monday-10-UTC delivery with per-tenant 7-day rolling
-- timer anchored to each tenant's last drop. The dashboard shows a live
-- countdown to the next drop; when it hits zero, the page auto-fires the
-- drop via /api/leads/check-and-drop. The lead-engine cron also fires
-- hourly as a fallback for tenants who don't visit the dashboard.
--
-- Stamp logic (in src/lib/leadEngine.ts assignLeadsForTenant):
--   On every successful drop assignment → next_lead_drop_at = now() + 7d
--
-- Cron filter (in /api/crons/lead-engine):
--   WHERE next_lead_drop_at IS NULL OR next_lead_drop_at <= now()
--
-- Dashboard:
--   /dashboard/leads page reads profiles.next_lead_drop_at, ticks down
--   every 1s. When ≤ now, POSTs /api/leads/check-and-drop, refreshes list.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS next_lead_drop_at TIMESTAMPTZ;

-- Backfill existing active tenants so their first hourly cron pass
-- doesn't try to drop again immediately. Use first_lead_drop_at + 7d if
-- present, otherwise now() so they get a fresh 7d clock from this rollout.
UPDATE profiles
SET next_lead_drop_at = COALESCE(first_lead_drop_at + INTERVAL '7 days', NOW())
WHERE is_active = true
  AND next_lead_drop_at IS NULL;

-- Index for the hourly cron's due-tenant query.
CREATE INDEX IF NOT EXISTS profiles_next_drop_due_idx
  ON profiles (next_lead_drop_at)
  WHERE is_active = true;
