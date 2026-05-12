-- BellAveGo Migration 009 — Consulting Reports + Lifecycle Automation
-- Adds the consulting_reports table (cron-driven, per-tier cadence),
-- new profile columns for lifecycle automation (24h nudges, last-report timestamps,
-- A2P 10DLC fields), and creates the Storage bucket policy for report PDFs.
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

-- ── consulting_reports — one row per generated report ────────────
-- Cron picks customers whose tier cadence is due and writes one row here per report.
-- pdf_url is a public Supabase Storage URL (bucket: consulting-reports).
CREATE TABLE IF NOT EXISTS consulting_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  profile_id text,                         -- duplicate of user_id, kept for old query shape
  title text NOT NULL,                     -- e.g., "Welcome Report" / "Q2 2026 Performance Report"
  client_name text,                        -- business_name snapshot at generation
  period_label text,                       -- e.g., "Feb 9 – May 9, 2026"
  report_type text NOT NULL DEFAULT 'periodic',  -- 'welcome' | 'periodic'
  cadence_tier text,                       -- snapshot of plan_tier at generation
  pdf_url text,                            -- public URL in Storage
  pdf_path text,                           -- Storage path (consulting-reports/{user_id}/{id}.pdf)
  payload jsonb,                           -- full ReportInput JSON for re-render / audit
  bellavego_score numeric(3,1),            -- composite for sorting/filtering
  generated_by text DEFAULT 'cron',        -- 'cron' | 'manual' | 'admin'
  created_at timestamptz DEFAULT now(),
  file_url text GENERATED ALWAYS AS (pdf_url) STORED  -- old dashboard alias
);
CREATE INDEX IF NOT EXISTS idx_consulting_reports_user_created
  ON consulting_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consulting_reports_profile
  ON consulting_reports (profile_id, created_at DESC);

-- ── profiles columns — lifecycle automation flags ────────────────
-- All ADD COLUMN IF NOT EXISTS so this migration is idempotent.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_consulting_report_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_nudged_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS services_offered text;        -- comma-list of actual trades
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_address text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS owner_first_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Chicago';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_report_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS a2p_brand_status text;        -- 'pending' | 'approved' | 'failed'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS a2p_campaign_sid text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS a2p_messaging_service_sid text;

-- Sensible defaults for fields the AI receptionist reads
UPDATE profiles SET ai_language = 'en' WHERE ai_language IS NULL;
UPDATE profiles SET ai_tone = 'friendly' WHERE ai_tone IS NULL;

-- ── Storage bucket policy (CONSULTING REPORTS PDFs) ──────────────
-- Bucket name: consulting-reports
-- IMPORTANT: bucket creation itself can't be done in pure SQL on Supabase Cloud
-- without storage admin role. Run this in the SQL editor — Supabase auto-creates the
-- entry. If it errors, create the bucket manually via Dashboard → Storage → New bucket
-- (name: consulting-reports, public: true) and skip this INSERT.
INSERT INTO storage.buckets (id, name, public)
VALUES ('consulting-reports', 'consulting-reports', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read (so SMS deep-links work without auth) — uploads only via service role
DROP POLICY IF EXISTS "Public read consulting-reports" ON storage.objects;
CREATE POLICY "Public read consulting-reports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'consulting-reports');

-- ── agent_runs — make sure table exists (used by all crons) ──────
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  leads_pushed integer,
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_created
  ON agent_runs (agent, created_at DESC);

-- ── Done ─────────────────────────────────────────────────────────
-- After running, verify:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'
--     AND column_name IN ('last_consulting_report_at','verification_nudged_at','zip_code');
--   SELECT id FROM storage.buckets WHERE id = 'consulting-reports';
