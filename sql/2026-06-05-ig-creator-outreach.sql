-- 2026-06-05 — IG creator outreach tracking
--
-- Manual DM workflow per Peter (no scraping per CLAUDE.md rule).
-- He saves accounts, sends DMs by hand. This table is just memory:
-- who he reached out to, when they replied, who became active creators,
-- how many paid referrals each drove, who hit the $1,500 bonus.
--
-- Distinct from outreach_leads (those are PROSPECTS we sell BellAveGo to).
-- IG creators are PROMOTERS we pay commission to.

create table if not exists ig_creator_outreach (
  id uuid primary key default gen_random_uuid(),
  handle text not null,                       -- @handle without the @
  followers integer,                          -- estimate from IG profile
  trade text,                                 -- HVAC / Plumbing / Electrical / etc
  hashtag_source text,                        -- #hvactech / #plumberlife / etc — where Peter found them
  notes text,                                 -- free-text: post style, vibe, prior interactions

  -- Workflow state
  status text not null default 'saved'
    check (status in ('saved','dmed','replied_yes','replied_no','active_creator','paid_bonus_hit','dropped')),

  -- Outreach timing
  dmed_at timestamptz,                        -- when Peter sent the cold DM
  replied_at timestamptz,                     -- when they responded
  reply_summary text,                         -- short summary of what they said

  -- Partnership lifecycle
  free_trial_code text,                       -- BAVG-XXXXXX unique referral code we generate
  free_trial_started_at timestamptz,          -- when they actually started the 3-month trial
  first_post_at timestamptz,
  posts_count integer default 0,
  paid_referrals_count integer default 0,     -- how many of their referrals paid month 1
  bonus_paid_at timestamptz,                  -- when we paid the $1,500 bonus at 5 refs
  total_commission_paid_cents integer default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ig_creator_outreach_handle_idx on ig_creator_outreach (lower(handle));
create index if not exists ig_creator_outreach_status_idx on ig_creator_outreach (status);
create index if not exists ig_creator_outreach_dmed_at_idx on ig_creator_outreach (dmed_at desc nulls last);
