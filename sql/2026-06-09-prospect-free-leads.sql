-- 2026-06-09 — prospect_free_leads table for the cold-email "1 free lead"
-- bait mechanism. Pre-pulled inventory keyed to outreach prospect biz_id.
--
-- Flow:
--   1. Nightly script picks 1 real lead from `leads` table matching each
--      cold-outreach prospect's zip + trade
--   2. Stashes copy here w/ biz_id (the outreach prospect's id)
--   3. Cold email links to /free-lead?b={biz_id}
--   4. Landing page reads from here in < 1 sec (no on-demand scrape)
--   5. After claim, mark claimed_at — gives us click attribution
--
-- This is what makes "click button -> reveal lead in 8 sec" possible.
-- On-demand scraping would take 30-90 sec and cost ~$0.15 per click
-- including misses. Pre-pulled = $0.05 once, instant reveal.

CREATE TABLE IF NOT EXISTS prospect_free_leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  biz_id       text NOT NULL,           -- outreach_prospects.id or your CSV key
  email        text,                    -- target email (for reply-attribution)
  trade        text,                    -- HVAC / plumbing / electrical / roofing / handyman
  zip          text,
  city         text,
  state        text,

  -- The lead we're showing them (snapshot — survives even if upstream lead is deleted)
  lead_owner_name    text,
  lead_street        text,
  lead_phone         text,
  lead_email         text,
  lead_year_built    int,
  lead_value         numeric(12,2),
  lead_signal        text,              -- permit | storm | aged | move_in
  lead_signal_detail text,              -- "AC permit filed 3 days ago" etc
  lead_est_job_min   numeric(10,2),
  lead_est_job_max   numeric(10,2),

  -- Attribution
  created_at   timestamptz DEFAULT now(),
  claimed_at   timestamptz,             -- stamped when /free-lead?b=X is opened
  clicked_at   timestamptz,             -- stamped when reveal completes
  signed_up_at timestamptz,             -- stamped when Stripe checkout completes
  signed_up_user_id text                -- Clerk user_id once they convert
);

CREATE INDEX IF NOT EXISTS prospect_free_leads_biz_id_idx ON prospect_free_leads (biz_id);
CREATE INDEX IF NOT EXISTS prospect_free_leads_email_idx ON prospect_free_leads (email);
CREATE UNIQUE INDEX IF NOT EXISTS prospect_free_leads_biz_id_unique ON prospect_free_leads (biz_id);

COMMENT ON TABLE prospect_free_leads IS 'Pre-pulled bait leads for cold-email outreach. One row per cold-email prospect. /free-lead?b={biz_id} reveals from here.';
