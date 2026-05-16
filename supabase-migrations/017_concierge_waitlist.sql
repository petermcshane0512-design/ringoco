-- BellAveGo Schema Migration 017 — Concierge + Multi-Location waitlist
-- Captures high-intent leads for tiers we're deferring until Q3 2026.
-- Surfaces them to Peter via SMS so he can do founder-led sales.
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

CREATE TABLE IF NOT EXISTS concierge_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  business_name text,
  phone text,
  business_type text,
  zip_code text,
  team_size text,
  monthly_revenue text,
  tier_interested text DEFAULT 'concierge',  -- 'concierge' | 'multi_location'
  notes text,
  user_id text,                              -- nullable; set if signed in
  status text DEFAULT 'new',                 -- 'new' | 'contacted' | 'qualified' | 'closed_won' | 'closed_lost'
  contacted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concierge_waitlist_status
  ON concierge_waitlist (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_waitlist_tier
  ON concierge_waitlist (tier_interested, created_at DESC);
