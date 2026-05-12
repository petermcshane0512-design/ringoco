-- BellAveGo Schema Migration 008 — Office Manager agent state tables
-- (Re-issue of original 007 content; 007 file got overwritten with mega-migration text.)
-- Three new agents share these tables: Quote Hunter, Collections, Reviews-reply.
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

-- ── Quote Hunter ──────────────────────────────────────────────
-- Each row = one quote sent to a prospect. Cron schedules SMS follow-ups
-- at day 2 / 7 / 14 unless customer replies "won" / "lost".
CREATE TABLE IF NOT EXISTS quote_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  customer_name text,
  customer_phone text NOT NULL,
  customer_email text,
  quote_amount numeric(10,2),
  quote_description text,
  source text DEFAULT 'manual',
  status text DEFAULT 'pending',
  followup_count integer DEFAULT 0,
  next_followup_at timestamptz,
  last_followup_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quote_followups_due
  ON quote_followups (next_followup_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_quote_followups_user
  ON quote_followups (user_id, status);

-- ── Collections ───────────────────────────────────────────────
-- Each row = one past-due invoice. Cron schedules SMS chases at day 2/7/14/30
-- with a Stripe pay-by-text link until customer pays or contractor writes off.
CREATE TABLE IF NOT EXISTS invoice_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  customer_name text,
  customer_phone text NOT NULL,
  customer_email text,
  invoice_amount numeric(10,2) NOT NULL,
  invoice_description text,
  due_date date,
  source text DEFAULT 'manual',
  status text DEFAULT 'pending',
  chase_count integer DEFAULT 0,
  next_chase_at timestamptz,
  last_chase_at timestamptz,
  stripe_payment_link text,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_followups_due
  ON invoice_followups (next_chase_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invoice_followups_user
  ON invoice_followups (user_id, status);

-- ── AI Reviews-reply drafts ───────────────────────────────────
-- One row per Google review we've drafted a response for. Contractor approves
-- via SMS, then copies the drafted reply to Google My Business.
CREATE TABLE IF NOT EXISTS review_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  google_review_id text UNIQUE,
  review_author text,
  review_text text,
  review_rating integer,
  drafted_reply text NOT NULL,
  status text DEFAULT 'drafted',
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_drafts_user_status
  ON review_drafts (user_id, status);
