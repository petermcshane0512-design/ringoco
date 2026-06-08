-- Track per-lead "hand-raise" auto-followup sends so the cron never
-- re-fires to the same lead twice.

ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS hand_raise_followup_sent_at timestamptz;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS hand_raise_open_count_at_send int;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS hand_raise_followup_body text;

CREATE INDEX IF NOT EXISTS outreach_leads_hand_raise_idx
  ON outreach_leads (status, hand_raise_followup_sent_at)
  WHERE hand_raise_followup_sent_at IS NULL;
