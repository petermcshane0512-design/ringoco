-- BellAveGo Schema Migration 003
-- Track whether the welcome SMS has been sent so we don't double-text on re-deliveries
-- of the same Stripe checkout.session.completed event (Stripe retries on 5xx).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS welcomed_at timestamptz;
