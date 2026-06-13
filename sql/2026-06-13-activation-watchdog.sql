-- 2026-06-13 — Activation watchdog column
-- Idempotency stamp so the watchdog only fires SMS once per failing
-- signup. Without this column, every 5-min cron run would re-alert
-- Peter for the same broken signup until lead_drops finally lands.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS activation_watchdog_alerted_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_activation_watchdog_idx
  ON profiles (first_paid_charge_at DESC)
  WHERE activation_watchdog_alerted_at IS NULL
    AND first_paid_charge_at IS NOT NULL;
