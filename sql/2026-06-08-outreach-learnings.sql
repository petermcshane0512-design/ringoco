-- Daily snapshot of cold-email campaign performance. Populated by
-- /api/crons/outreach-learner at 3pm CT. Used to surface signal on
-- which subject lines + steps are winning.

CREATE TABLE IF NOT EXISTS outreach_learnings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     text NOT NULL,
  date            date NOT NULL,
  sent            int NOT NULL DEFAULT 0,
  opens           int NOT NULL DEFAULT 0,
  open_rate_pct   numeric(5,2) NOT NULL DEFAULT 0,
  replies         int NOT NULL DEFAULT 0,
  reply_rate_pct  numeric(5,2) NOT NULL DEFAULT 0,
  clicks          int NOT NULL DEFAULT 0,
  click_rate_pct  numeric(5,2) NOT NULL DEFAULT 0,
  bounces         int NOT NULL DEFAULT 0,
  bounce_rate_pct numeric(5,2) NOT NULL DEFAULT 0,
  unsubs          int NOT NULL DEFAULT 0,
  unsub_rate_pct  numeric(5,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, date)
);

CREATE INDEX IF NOT EXISTS outreach_learnings_campaign_date_idx
  ON outreach_learnings (campaign_id, date DESC);
