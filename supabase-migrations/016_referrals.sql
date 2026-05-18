-- ─────────────────────────────────────────────────────────────────
-- 016_referrals.sql — Referral system (free month per referral)
--
-- Run once in the Supabase SQL editor (production project).
--
-- Adds:
--   1. profiles.referral_code      — each customer's unique shareable code
--   2. profiles.referred_by        — set on signup from the bavg_ref cookie
--   3. referrals table             — one row per referred customer + Stripe credit
--
-- Idempotent: uses IF NOT EXISTS so re-running is safe.
-- ─────────────────────────────────────────────────────────────────

-- ── Columns on profiles ─────────────────────────────────────────
alter table profiles
  add column if not exists referral_code text;

alter table profiles
  add column if not exists referred_by text;

-- Unique per code, but allow NULL (most rows won't have one yet)
create unique index if not exists profiles_referral_code_unique
  on profiles (referral_code)
  where referral_code is not null;

-- Lookup index for "find the referrer by code" during attribution
create index if not exists profiles_referred_by_idx
  on profiles (referred_by)
  where referred_by is not null;


-- ── referrals table ─────────────────────────────────────────────
-- One row per attributed referral. Two-stage flow (anti-abuse v2):
--   - status='pending'  : recorded at first checkout, awaiting day-31 maturity
--   - status='credited' : referrer's Stripe credit has been applied
--   - status='voided'   : referred customer cancelled/refunded before day 31
-- UNIQUE on referred_user_id guarantees we never double-credit on retry.
create table if not exists referrals (
  id                                uuid primary key default gen_random_uuid(),
  referrer_user_id                  text not null,
  referred_user_id                  text not null unique,
  referral_code                     text not null,
  status                            text not null default 'pending',
  referred_subscription_id          text,
  referred_subscription_started_at  timestamptz,
  credit_amount_cents               integer,             -- nullable until status='credited'
  stripe_balance_txn_id             text,
  credit_applied_at                 timestamptz,
  voided_at                         timestamptz,
  voided_reason                     text,
  created_at                        timestamptz default now()
);

create index if not exists referrals_referrer_idx on referrals (referrer_user_id);
create index if not exists referrals_code_idx on referrals (referral_code);
create index if not exists referrals_subscription_idx on referrals (referred_subscription_id) where referred_subscription_id is not null;
create index if not exists referrals_status_idx on referrals (status);


-- ── Verify ──────────────────────────────────────────────────────
-- Run these to confirm the migration landed:
--   select column_name from information_schema.columns
--     where table_name = 'profiles' and column_name in ('referral_code', 'referred_by');
--   select to_regclass('public.referrals');
