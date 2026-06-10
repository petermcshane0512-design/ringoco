-- 2026-06-10 — Homepage Opportunity Checker
--
-- Adds three tables to power the homepage zip-checker widget:
--   1. opportunity_checks    — capture log of every check (warm-lead list)
--   2. opportunity_zip_cache — 24h cache of (zip, trade) → count
--   3. territories           — exclusivity registry; zip+trade slots
--   4. opportunity_waitlist  — email capture for uncovered zips
--
-- The widget itself queries `leads` (homeowner pool from 2026-06-04 build)
-- via `zips_within_miles()` (zip_centroids haversine helper). No new
-- third-party data dependencies.

-- ── opportunity_checks ──────────────────────────────────────────────────
-- Every homepage check lands here. Each row = a contractor told us
-- their trade + service zip. This IS the warm-lead funnel.
create table if not exists opportunity_checks (
  id              uuid primary key default gen_random_uuid(),
  zip             text not null,
  trade           text not null,              -- 'hvac' | 'plumbing' | 'electrical' | 'roofing' | 'handyman' | 'other:<text>'
  count_returned  integer,                    -- null if fallback was shown
  covered         boolean not null default true,
  promo           text,
  ref_code        text,
  biz_id          text,
  referer         text,
  user_agent      text,
  ip_hash         text,
  created_at      timestamptz not null default now()
);
create index if not exists opportunity_checks_zip_idx on opportunity_checks (zip, created_at desc);
create index if not exists opportunity_checks_trade_idx on opportunity_checks (trade, created_at desc);

-- ── opportunity_zip_cache ───────────────────────────────────────────────
-- Cache the expensive count query per (zip, trade) for 24h so repeat
-- visitors / refreshes don't re-hit the leads table.
create table if not exists opportunity_zip_cache (
  zip          text not null,
  trade        text not null,
  count_real   integer not null,
  covered      boolean not null,
  computed_at  timestamptz not null default now(),
  primary key (zip, trade)
);
create index if not exists opportunity_zip_cache_age_idx on opportunity_zip_cache (computed_at);

-- ── territories ─────────────────────────────────────────────────────────
-- Exclusivity registry. Read by the homepage OpportunityChecker widget
-- AND the dedicated /start/area gate. Written by the Stripe webhook on
-- checkout.session.completed (claim) and customer.subscription.deleted
-- (move to grace for 14 days, then release-grace cron flips → open).
--
--   status:
--     'open'    — no contractor in this zip+trade slot
--     'grace'   — claimed but in 14-day grace period (post-cancellation)
--     'claimed' — locked; widget + /start/area show waitlist CTA
--
-- claimed_by_user_id is TEXT not UUID — Clerk user IDs are strings
-- (`user_xxxx`) not UUIDs. The Stripe + business columns are populated
-- by the webhook so /admin/territories can render them without joining
-- profiles.
create table if not exists territories (
  zip                     text not null,
  trade                   text not null,
  status                  text not null default 'open'
                            check (status in ('open','grace','claimed')),
  claimed_by_user_id      text,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  business_name           text,
  metro                   text,
  claimed_at              timestamptz,
  grace_expires_at        timestamptz,
  notes                   text,
  updated_at              timestamptz not null default now(),
  primary key (zip, trade)
);
create index if not exists territories_status_idx on territories (status);
create index if not exists territories_owner_idx on territories (claimed_by_user_id) where claimed_by_user_id is not null;
create index if not exists territories_grace_idx on territories (grace_expires_at) where status = 'grace';

-- ── opportunity_waitlist ────────────────────────────────────────────────
-- Email capture for two cases:
--   1. Zip has no scraper coverage → "Drop your email and we'll tell you
--      when we open {zip}"
--   2. Zip is already claimed → "Join the waitlist"
create table if not exists opportunity_waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  zip         text not null,
  trade       text not null,
  reason      text not null check (reason in ('uncovered','claimed')),
  promo       text,
  ref_code    text,
  created_at  timestamptz not null default now(),
  unique (email, zip, trade)
);
create index if not exists opportunity_waitlist_zip_idx on opportunity_waitlist (zip);
