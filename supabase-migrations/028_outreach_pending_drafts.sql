-- ── outreach_pending_drafts ─────────────────────────────────────────────────
-- Auto-drafted replies to hot cold-email replies, waiting on Peter's SMS
-- approval. Created by the Instantly reply webhook on classification='positive'.
-- Closed when Peter texts SEND/KILL/EDIT to the alert.
--
-- TTL: drafts auto-expire after 1 hour. Older drafts get a "stale" status so
-- Peter doesn't accidentally ship a reply that's no longer fresh.
--
-- Lookup by short_code (4 random chars). Peter texts e.g. "SEND a3f9" or
-- "KILL a3f9" — the SMS handler matches that pattern, looks up the row,
-- and acts on it.

CREATE TABLE IF NOT EXISTS outreach_pending_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code text UNIQUE NOT NULL,            -- 4 random lowercase alphanumeric
  lead_email text NOT NULL,
  campaign_id text,
  business_name text,
  trade text,
  city text,
  original_reply text NOT NULL,               -- what the lead said
  draft_body text NOT NULL,                   -- what we propose to send back
  -- Original Instantly event payload — needed to thread the reply back
  -- via Instantly's API (carries thread UUID / message ID).
  source_event jsonb,
  status text NOT NULL DEFAULT 'pending',     -- pending | sent | killed | edited | expired | failed
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  acted_at timestamptz,                       -- when Peter responded
  sent_at timestamptz                         -- when reply actually shipped
);

CREATE INDEX IF NOT EXISTS outreach_pending_drafts_short_code_idx
  ON outreach_pending_drafts (short_code);
CREATE INDEX IF NOT EXISTS outreach_pending_drafts_status_expires_idx
  ON outreach_pending_drafts (status, expires_at);
