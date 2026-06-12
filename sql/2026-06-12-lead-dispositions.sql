-- 2026-06-12 — CEO Nucleus call-queue dispositions.
-- Keyed by prospect EMAIL (the stable cross-system key between
-- outreach_leads, Instantly, and prospect_free_leads).
-- "no_answer" rows re-surface the prospect after 24h (handled in query).

CREATE TABLE IF NOT EXISTS lead_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  action text NOT NULL CHECK (action IN ('called','voicemail','no_answer','bad_number','booked_call')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_dispositions_email ON lead_dispositions (email, created_at DESC);
