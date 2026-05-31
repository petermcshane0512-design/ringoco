-- 2026-05-30 — Predictive lead scoring + self-learning loop.
--
-- buyer_score: 1-10, Claude-generated from website + reviews + photos
-- score_reasoning: short JSON of signals that led to score
-- scored_at: when the scorer ran
-- score_version: which scoring prompt version was used (for A/B + learning)
-- trade: extend to non-HVAC. Default 'HVAC' for back-compat.
--
-- consent + multi-trade columns also.

ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS buyer_score int;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS score_reasoning jsonb;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS scored_at timestamptz;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS score_version text;

-- Per-lead TCPA consent. Must be set BEFORE warm caller dials.
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS caller_consent_at timestamptz;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS caller_consent_source text;

-- ICP expansion — trade default HVAC, but now multi-trade aware.
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS trade_normalized text;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS employee_count_est int;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS website_snippet text; -- cached homepage text

-- Indexes
CREATE INDEX IF NOT EXISTS outreach_leads_score_idx
  ON outreach_leads (buyer_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS outreach_leads_trade_normalized_idx
  ON outreach_leads (trade_normalized);
CREATE INDEX IF NOT EXISTS outreach_leads_consent_idx
  ON outreach_leads (caller_consent_at) WHERE caller_consent_at IS NOT NULL;

-- Self-learning corpus: every time a lead converts to paid, snapshot
-- their signals so the next round of scoring learns from them.
CREATE TABLE IF NOT EXISTS lead_scoring_signals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid REFERENCES outreach_leads(id) ON DELETE SET NULL,
  business_name   text,
  trade           text,
  signals         jsonb NOT NULL, -- {review_count, rating, employee_est, website_quality_score, etc.}
  outcome         text NOT NULL, -- 'converted_paid' | 'replied_interested' | 'bounced' | 'rejected'
  weight          numeric(4,2) DEFAULT 1.0, -- paid = 5, replied = 1, bounced = -0.5
  captured_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_scoring_signals_outcome_idx
  ON lead_scoring_signals (outcome, captured_at DESC);
CREATE INDEX IF NOT EXISTS lead_scoring_signals_trade_idx
  ON lead_scoring_signals (trade);

-- Versioned scoring prompts. Self-learning loop writes new prompts here
-- after analyzing the signals corpus. Most-recent wins, but older versions
-- preserved so we can roll back if a new prompt drops conv rate.
CREATE TABLE IF NOT EXISTS lead_scoring_prompts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version         text NOT NULL,
  prompt_text     text NOT NULL,
  generated_from_signal_count int,
  notes           text,
  is_active       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_scoring_prompts_active_idx
  ON lead_scoring_prompts (is_active) WHERE is_active = true;
