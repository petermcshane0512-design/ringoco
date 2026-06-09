-- Per-send log for the AI outreach feature (2026-06-09 leads-only pivot).
-- Apply in Supabase Studio SQL Editor.

CREATE TABLE IF NOT EXISTS lead_outreach_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  lead_id     uuid NOT NULL,
  drop_id     uuid,
  channel     text NOT NULL CHECK (channel IN ('sms', 'email')),
  subject     text,
  body        text NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  replied_at  timestamptz,
  reply_body  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_outreach_log_user_idx ON lead_outreach_log (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS lead_outreach_log_lead_idx ON lead_outreach_log (lead_id);
CREATE INDEX IF NOT EXISTS lead_outreach_log_drop_idx ON lead_outreach_log (drop_id);
