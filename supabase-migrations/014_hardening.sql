-- BellAveGo Schema Migration 014 — Hands-off hardening
--
-- Adds the supporting tables for:
--   • SMS opt-outs (TCPA — never re-message a STOP'd number)
--   • Support ticket auto-ack + escalation cron
--   • Forwarding verification (real test, not the false-positive one)
--   • Surfaced admin actions (prompt suggestions / review drafts approval)
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

-- ── SMS opt-outs ─────────────────────────────────────────────────
-- Persist forever: once a customer texts STOP we never re-engage from any
-- BellAveGo number, even via a different campaign.
CREATE TABLE IF NOT EXISTS sms_optouts (
  phone text PRIMARY KEY,
  reason text,
  opted_out_at timestamptz DEFAULT now() NOT NULL
);

-- ── Support ticket escalation columns ────────────────────────────
-- Added to existing support_tickets table (migration 012). Tracks which
-- tickets we've already auto-ack'd to the customer + escalated to Peter.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS customer_acked_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_support_tickets_unresolved_priority
  ON support_tickets (priority, created_at)
  WHERE status IN ('new', 'triaged', 'in_progress');

-- ── Forwarding verification ──────────────────────────────────────
-- Replaces the false-positive test (which called owner FROM bellavego, so
-- contractor picking up = pass). Real test: call FROM TWILIO_PHONE_NUMBER
-- to owner's existing line, wait for carrier no-answer-forward, see if
-- BellAveGo voice route receives the inbound call.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS forwarding_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS forwarding_test_started_at timestamptz;

-- ── Prompt suggestion + review draft surfacing ───────────────────
-- The cron-improved-prompts and review-draft tables already exist; we just
-- add an "applied_at" / "approved_at" so the admin UI can mark items done.
ALTER TABLE prompt_suggestions
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

ALTER TABLE review_drafts
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;
