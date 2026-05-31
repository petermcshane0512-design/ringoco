-- 2026-05-30 — AI warm caller infrastructure.
--
-- Tracks every outbound warm call from Emma to a cold-email opener.
-- Joins to outreach_leads.id. Used by /api/crons/warm-caller to dedupe
-- and by /api/vapi/warm-call-report to persist outcome.

CREATE TABLE IF NOT EXISTS outreach_calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid REFERENCES outreach_leads(id) ON DELETE CASCADE,
  vapi_call_id    text,
  phone_dialed    text NOT NULL,
  initiated_at    timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  duration_sec    int,
  outcome         text, -- interested | objection | not_now | wrong_person | no_answer | voicemail | failed
  outcome_detail  text,
  callback_at     timestamptz,
  hot_lead        boolean NOT NULL DEFAULT false,
  founder_notified_at timestamptz,
  recording_url   text,
  transcript      text,
  cost_usd        numeric(10,4)
);

-- Anti-fatigue dedup is enforced at the app layer (lib/warmCaller/triggerCall.ts
-- rejects any call within 7 days of the most-recent prior call for the same
-- lead). A DB unique-index with date_trunc would require an IMMUTABLE function
-- wrapper — not worth the complexity. App-level guard is sufficient.
CREATE INDEX IF NOT EXISTS outreach_calls_lead_idx
  ON outreach_calls (lead_id, initiated_at DESC);

CREATE INDEX IF NOT EXISTS outreach_calls_outcome_idx ON outreach_calls (outcome);
CREATE INDEX IF NOT EXISTS outreach_calls_hot_idx ON outreach_calls (hot_lead) WHERE hot_lead = true;
CREATE INDEX IF NOT EXISTS outreach_calls_initiated_idx ON outreach_calls (initiated_at DESC);

-- Open + variant tracking columns on outreach_leads
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS first_opened_at timestamptz;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS open_count int NOT NULL DEFAULT 0;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS report_visit_at timestamptz;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS copy_variant text;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS subject_variant text;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS dnc_until timestamptz; -- do not call honor
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS owner_phone text; -- normalize phone storage

CREATE INDEX IF NOT EXISTS outreach_leads_opened_idx ON outreach_leads (first_opened_at) WHERE first_opened_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS outreach_leads_report_visit_idx ON outreach_leads (report_visit_at) WHERE report_visit_at IS NOT NULL;
