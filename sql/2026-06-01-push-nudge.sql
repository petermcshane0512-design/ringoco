-- 2026-06-01 — Push setup nudge idempotency
--
-- One-time SMS fires from the lead-alert webhook when push delivers to
-- 0 devices (contractor finished setup without enabling phone alerts).
-- This column gates the send so we don't nag on every subsequent call.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_nudge_sent_at TIMESTAMPTZ;
