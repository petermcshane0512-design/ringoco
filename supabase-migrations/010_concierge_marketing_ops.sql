-- BellAveGo Schema Migration 010 — Concierge AI Marketing Operations
-- Backs the $1,997/mo Concierge tier. Daily/weekly cron writes here, customer-facing
-- /dashboard/concierge reads from here, marketing-ops-agent reads + writes here.
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.
--
-- Multi-tenant convention (matches migrations 001-009): user_id text column matching Clerk
-- userId, RLS disabled, isolation enforced server-side via .eq('user_id', userId).

-- ── Concierge settings (one row per customer) ──────────────────
-- Per-customer config collected during Concierge onboarding wizard.
-- Service area, competitors, ad budget, integration credentials.
CREATE TABLE IF NOT EXISTS concierge_settings (
  user_id text PRIMARY KEY,
  service_area_zips text[],                   -- ['30301','30302',...] for permit-scanner + weather-trigger
  competitor_place_ids text[],                -- Google Maps Place IDs for competitor-watcher
  website_url text,                           -- for local-seo-publisher to publish to
  website_provider text,                      -- 'webflow' | 'wordpress' | 'shopify' | null
  website_api_token text,                     -- encrypted at rest by Supabase
  google_place_id text,                       -- customer's own GBP for read-only ops
  google_ads_customer_id text,                -- their Google Ads account (under our MCC)
  meta_ad_account_id text,                    -- their Meta Ad Account (under our BM)
  growth_wallet_balance_cents integer DEFAULT 0,
  growth_wallet_auto_topup_cents integer,     -- optional auto-replenish target
  reactivation_enabled boolean DEFAULT true,
  weather_triggers_enabled boolean DEFAULT true,
  permits_enabled boolean DEFAULT true,
  competitor_watch_enabled boolean DEFAULT true,
  weekly_report_day integer DEFAULT 1,        -- 1 = Monday
  onboarded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Weekly strategy reports ────────────────────────────────────
-- 52/yr for Concierge tier. Each row = one weekly McKinsey-style PDF.
-- Storage: PDF stored in Supabase Storage bucket 'concierge-reports', URL here.
CREATE TABLE IF NOT EXISTS concierge_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  report_type text NOT NULL,                  -- 'weekly_strategy' | 'quarterly_deep_dive'
  week_start date,                            -- Monday of the week this report covers
  pdf_url text,                               -- Supabase Storage public URL
  payload jsonb,                              -- structured data the AI used + key insights
  delivered_sms_at timestamptz,
  delivered_email_at timestamptz,
  opened_at timestamptz,                      -- tracked via short-link redirect
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_concierge_reports_user_date
  ON concierge_reports (user_id, week_start DESC);

-- ── Marketing campaigns (live Google/Meta ad campaigns) ────────
-- One row per active campaign managed by AI. Updates daily with spend + performance.
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  platform text NOT NULL,                     -- 'google_ads' | 'meta_ads'
  external_campaign_id text,                  -- Google Ads / Meta campaign ID
  campaign_name text,
  objective text,                             -- 'leads' | 'calls' | 'awareness'
  daily_budget_cents integer,
  status text DEFAULT 'active',               -- 'active' | 'paused' | 'ended'
  spend_to_date_cents integer DEFAULT 0,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  conversions integer DEFAULT 0,
  ai_notes text,                              -- last AI rationale for changes
  last_optimized_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_user
  ON marketing_campaigns (user_id, status);

-- ── Ad creatives (generated copy + assets) ─────────────────────
-- AI-generated weekly from customer's call transcripts. Approved or auto-shipped.
CREATE TABLE IF NOT EXISTS ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  platform text NOT NULL,                     -- 'google_ads' | 'meta_ads'
  format text,                                -- 'rsa' | 'image' | 'video_script'
  headline text,
  description text,
  cta text,
  image_url text,
  source_transcript_ids uuid[],               -- call_logs IDs that inspired this creative
  status text DEFAULT 'pending_approval',     -- 'pending_approval' | 'live' | 'rejected'
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_user_status
  ON ad_creatives (user_id, status);

-- ── Lead lists (sourced via permits, weather, new-homeowner data) ──
-- One row per discovered lead. Outbound SMS sender reads from here.
CREATE TABLE IF NOT EXISTS lead_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  lead_source text NOT NULL,                  -- 'permit' | 'weather' | 'new_homeowner' | 'apollo'
  source_event_id text,                       -- FK-ish to weather_triggers/permit_events
  customer_name text,
  customer_phone text,
  customer_email text,
  address text,
  zip text,
  service_hypothesis text,                    -- "Storm damage — roofing repair likely"
  contacted_at timestamptz,
  response text,                              -- 'interested' | 'not_now' | 'stop' | null
  booked_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_lists_user_unsent
  ON lead_lists (user_id, contacted_at)
  WHERE contacted_at IS NULL;

-- ── Competitor intel (daily watcher output) ────────────────────
-- One row per competitor snapshot per day. Diffs surface in weekly report.
CREATE TABLE IF NOT EXISTS competitor_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  competitor_place_id text NOT NULL,
  competitor_name text,
  snapshot_date date NOT NULL,
  rating numeric(2,1),
  review_count integer,
  new_reviews_today integer,
  recent_review_themes text[],                -- ['pricing','wait time','quality'] from sentiment
  raw jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_competitor_intel_user_place_day
  ON competitor_intel (user_id, competitor_place_id, snapshot_date);

-- ── Growth Wallet ledger (every spend + fee event) ─────────────
-- Authoritative ledger for the $1K/$2.5K/$5K monthly ad budget add-on.
-- Stripe top-up = positive, ad spend + 15% mgmt fee = negative.
CREATE TABLE IF NOT EXISTS growth_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  kind text NOT NULL,                         -- 'topup' | 'ad_spend' | 'mgmt_fee' | 'refund'
  amount_cents integer NOT NULL,              -- positive add, negative subtract
  balance_after_cents integer NOT NULL,
  campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  stripe_charge_id text,
  note text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_wallet_user
  ON growth_wallet_ledger (user_id, created_at DESC);

-- ── Weather triggers (NOAA NWS poll output) ────────────────────
-- One row per severe-weather alert intersecting a customer's service area.
CREATE TABLE IF NOT EXISTS weather_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  noaa_alert_id text NOT NULL,
  event_type text,                            -- 'severe_thunderstorm' | 'winter_storm' | 'flood'
  severity text,                              -- 'extreme' | 'severe' | 'moderate' | 'minor'
  affected_zips text[],
  starts_at timestamptz,
  ends_at timestamptz,
  campaign_triggered boolean DEFAULT false,   -- did we send reactivation SMS in response?
  payload jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_weather_user_alert
  ON weather_triggers (user_id, noaa_alert_id);

-- ── Permit events (county open-data scrape output) ─────────────
-- One row per pulled permit in a customer's service area.
CREATE TABLE IF NOT EXISTS permit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  permit_id text NOT NULL,                    -- county-issued ID, unique per source
  source text NOT NULL,                       -- 'nyc' | 'la' | 'chicago' | 'atlanta' | ...
  permit_type text,                           -- 'hvac' | 'plumbing' | 'electrical' | 'roof'
  property_address text,
  property_zip text,
  permit_value_cents integer,                 -- declared cost on permit
  issued_at date,
  lead_generated_id uuid REFERENCES lead_lists(id) ON DELETE SET NULL,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_permit_user_source_id
  ON permit_events (user_id, source, permit_id);

-- ── SEO blog posts (local content generated weekly) ────────────
-- One row per AI-generated blog post auto-published to customer's website.
CREATE TABLE IF NOT EXISTS seo_blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  target_query text,                          -- 'best HVAC Atlanta' etc.
  title text,
  slug text,
  body_md text,
  published_url text,
  published_at timestamptz,
  word_count integer,
  status text DEFAULT 'pending_publish',      -- 'pending_publish' | 'published' | 'failed'
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seo_blog_user_status
  ON seo_blog_posts (user_id, status);

-- ── Reactivation drips (past-customer SMS campaigns) ───────────
-- One row per active drip. Used by reactivation-campaign skill.
CREATE TABLE IF NOT EXISTS reactivation_drips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  customer_phone text NOT NULL,
  customer_name text,
  last_job_at date,
  trigger text,                               -- 'seasonal' | 'weather' | 'milestone'
  message_sent text,
  sent_at timestamptz DEFAULT now(),
  response text,                              -- 'booked' | 'no_thanks' | 'stop' | null
  booked_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_reactivation_drips_user_sent
  ON reactivation_drips (user_id, sent_at DESC);
