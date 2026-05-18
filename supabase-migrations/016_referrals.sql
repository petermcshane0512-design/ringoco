drop table if exists referrals;

alter table profiles add column if not exists referral_code text;
alter table profiles add column if not exists referred_by text;

create unique index if not exists profiles_referral_code_unique
  on profiles (referral_code)
  where referral_code is not null;

create index if not exists profiles_referred_by_idx
  on profiles (referred_by)
  where referred_by is not null;

create table referrals (
  id                                uuid primary key default gen_random_uuid(),
  referrer_user_id                  text not null,
  referred_user_id                  text not null unique,
  referral_code                     text not null,
  status                            text not null default 'pending',
  referred_subscription_id          text,
  referred_subscription_started_at  timestamptz,
  credit_amount_cents               integer,
  stripe_balance_txn_id             text,
  credit_applied_at                 timestamptz,
  voided_at                         timestamptz,
  voided_reason                     text,
  created_at                        timestamptz default now()
);

create index referrals_referrer_idx on referrals (referrer_user_id);
create index referrals_code_idx on referrals (referral_code);
create index referrals_subscription_idx on referrals (referred_subscription_id) where referred_subscription_id is not null;
create index referrals_status_idx on referrals (status);

select column_name from information_schema.columns
  where table_name = 'profiles' and column_name in ('referral_code', 'referred_by');

select to_regclass('public.referrals') as referrals_table;
