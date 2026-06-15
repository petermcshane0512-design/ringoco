-- 2026-06-15 — the copy-iteration agent loop was DEAD: variant-generator wrote
-- new copy variants daily but every insert failed ("table outreach_variants
-- not found"). These 3 tables are the loop's memory. Once they exist:
--   variant-generator (6am)  → writes 2 fresh Step-0 drafts/day
--   variant-scorer (1am)     → Bayesian-scores live vs draft by open/click/reply
--   winners auto-promote after the Day-14 confidence threshold.
-- This is what lets the agents actually attack the open→click problem.

CREATE TABLE IF NOT EXISTS outreach_variants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      text,
  variant_slug     text NOT NULL,
  step             int  NOT NULL DEFAULT 0,
  subject          text NOT NULL,
  body             text NOT NULL,
  status           text NOT NULL DEFAULT 'draft',   -- draft | live | retired
  generated_by     text,
  generation_notes text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, variant_slug)
);

CREATE TABLE IF NOT EXISTS outreach_variant_scores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id     uuid REFERENCES outreach_variants(id) ON DELETE CASCADE,
  date           date NOT NULL DEFAULT current_date,
  sent           int  NOT NULL DEFAULT 0,
  open_rate      numeric NOT NULL DEFAULT 0,
  reply_rate     numeric NOT NULL DEFAULT 0,
  click_rate     numeric NOT NULL DEFAULT 0,
  posterior_mean numeric,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, date)
);

CREATE TABLE IF NOT EXISTS outreach_variant_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  uuid REFERENCES outreach_variants(id) ON DELETE CASCADE,
  lead_email  text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, lead_email)
);

CREATE INDEX IF NOT EXISTS idx_variant_scores_variant ON outreach_variant_scores(variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_assign_variant ON outreach_variant_assignments(variant_id);
