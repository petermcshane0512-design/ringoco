-- A/B test framework for the cold-email campaign. Each variant is a
-- candidate Step 0 subject + body. Allocator assigns leads to variants
-- at push time. Scorer reads daily perf and promotes winner / kills
-- loser after statistical significance reached.

CREATE TABLE IF NOT EXISTS outreach_variants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     text NOT NULL,
  variant_slug    text NOT NULL,                    -- e.g. 'v1-leads-hook', 'v2-pain-led'
  step            int NOT NULL DEFAULT 0,           -- 0=hook, 1=bump, 2=closer
  subject         text NOT NULL,
  body            text NOT NULL,
  status          text NOT NULL DEFAULT 'draft',    -- draft|live|paused|winner|loser
  generated_by    text NOT NULL DEFAULT 'human',    -- 'human' or 'agent:variant-generator'
  generation_notes text,                            -- why this variant was tried
  promoted_at     timestamptz,                      -- when status flipped to winner
  killed_at       timestamptz,                      -- when status flipped to loser
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, variant_slug, step)
);

CREATE INDEX IF NOT EXISTS outreach_variants_campaign_status_idx
  ON outreach_variants (campaign_id, status);

-- Per-lead variant attribution. When the allocator picks a variant for a
-- lead, it writes the variant_id here so the scorer can join.
CREATE TABLE IF NOT EXISTS outreach_variant_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_lead_id uuid NOT NULL,
  campaign_id     text NOT NULL,
  step            int NOT NULL DEFAULT 0,
  variant_id      uuid NOT NULL REFERENCES outreach_variants(id),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outreach_lead_id, step)
);

CREATE INDEX IF NOT EXISTS variant_assignments_variant_idx
  ON outreach_variant_assignments (variant_id);
CREATE INDEX IF NOT EXISTS variant_assignments_lead_idx
  ON outreach_variant_assignments (outreach_lead_id);

-- Daily per-variant performance snapshot. Populated by variant scorer.
CREATE TABLE IF NOT EXISTS outreach_variant_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id      uuid NOT NULL REFERENCES outreach_variants(id),
  date            date NOT NULL,
  sent            int NOT NULL DEFAULT 0,
  opens           int NOT NULL DEFAULT 0,
  replies         int NOT NULL DEFAULT 0,
  positive_replies int NOT NULL DEFAULT 0,
  clicks          int NOT NULL DEFAULT 0,
  signups         int NOT NULL DEFAULT 0,          -- end-to-end: paid customer attributable
  open_rate       numeric(6,3) NOT NULL DEFAULT 0,
  reply_rate      numeric(6,3) NOT NULL DEFAULT 0,
  click_rate      numeric(6,3) NOT NULL DEFAULT 0,
  signup_rate     numeric(6,3) NOT NULL DEFAULT 0,
  posterior_mean  numeric(8,5),                    -- bayesian best-arm-bandit posterior
  posterior_lo95  numeric(8,5),                    -- 95% CI lower bound
  posterior_hi95  numeric(8,5),                    -- 95% CI upper bound
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, date)
);

CREATE INDEX IF NOT EXISTS variant_scores_date_idx
  ON outreach_variant_scores (date DESC);

-- Per-trade rollup. Trade segmenter writes here.
CREATE TABLE IF NOT EXISTS outreach_trade_segments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     text NOT NULL,
  trade           text NOT NULL,                   -- 'HVAC' | 'Plumbing' | 'Electrical' | 'Roofing' | 'Handyman'
  date            date NOT NULL,
  sent            int NOT NULL DEFAULT 0,
  opens           int NOT NULL DEFAULT 0,
  replies         int NOT NULL DEFAULT 0,
  positive_replies int NOT NULL DEFAULT 0,
  clicks          int NOT NULL DEFAULT 0,
  open_rate       numeric(6,3) NOT NULL DEFAULT 0,
  reply_rate      numeric(6,3) NOT NULL DEFAULT 0,
  click_rate      numeric(6,3) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, trade, date)
);

CREATE INDEX IF NOT EXISTS trade_segments_date_idx
  ON outreach_trade_segments (date DESC);

-- Seed v1 (the live copy we just shipped today)
INSERT INTO outreach_variants (campaign_id, variant_slug, step, subject, body, status, generated_by, generation_notes)
VALUES
  ('8ac14ff5-8cd4-4ac4-8549-88dddbef8067', 'v1-leads-1to3crew', 0,
   '{{firstName}} — 2-3 extra {{city}} jobs/wk for {{companyName}}',
   'see fire-first-mass-send.mjs Step 0 — seeded 2026-06-08',
   'live', 'human', 'first variant — 1-3 person crew positioning, leads + AI receptionist + $297 flat + 30-day MBG + demo line')
ON CONFLICT (campaign_id, variant_slug, step) DO NOTHING;
