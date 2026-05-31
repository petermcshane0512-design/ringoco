-- 2026-05-30 — Hunter.io verification columns on outreach_leads.
-- Set by /api/crons/verify-emails before send-time so we never email
-- a known-bad address (saves Gmail/Zoho reputation).

ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS hunter_verified_at timestamptz;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS hunter_status text;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS hunter_score int;

CREATE INDEX IF NOT EXISTS outreach_leads_hunter_status_idx
  ON outreach_leads (hunter_status) WHERE hunter_status IS NOT NULL;
