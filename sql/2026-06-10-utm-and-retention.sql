-- 2026-06-10 — UTM attribution + funnel events (T5 of offer-rebuild plan).
--
-- Adds UTM fields to profiles so we can attribute every paid customer
-- back to the channel that brought them, and creates a lightweight
-- events table for funnel telemetry (page_view, checkout_started,
-- checkout_completed).
--
-- Powers /admin/retention — the only number that matters: $97 → $497
-- month-2 conversion by cohort.

-- ── profile UTM columns ────────────────────────────────────────────────
-- One row per customer. UTM is captured at first touch (/start landing)
-- via cookies, forwarded through Stripe metadata at checkout, then
-- stamped on the profile by the webhook. All five columns are optional
-- (organic + direct visitors won't have any), but the trio
-- {first_touch_at, first_touch_url, paid_at} is what powers cohort
-- analysis.
alter table profiles add column if not exists utm_source   text;
alter table profiles add column if not exists utm_medium   text;
alter table profiles add column if not exists utm_campaign text;
alter table profiles add column if not exists utm_term     text;
alter table profiles add column if not exists utm_content  text;
alter table profiles add column if not exists first_touch_at  timestamptz;
alter table profiles add column if not exists first_touch_url text;
alter table profiles add column if not exists paid_at         timestamptz;
-- 2026-06-10 — month-2 retention is THE number that gates scaling.
-- We reuse the EXISTING profiles.second_paid_charge_at column (originally
-- written by the creator-payout flow in stripe/webhook). T5 makes the
-- stamp unconditional — it now lands on every customer's second paid
-- invoice, not only those with a creator promo code.

create index if not exists profiles_utm_source_idx on profiles (utm_source);
create index if not exists profiles_paid_at_idx on profiles (paid_at);
create index if not exists profiles_second_paid_idx on profiles (second_paid_charge_at);
create index if not exists profiles_first_paid_idx on profiles (first_paid_charge_at);

-- ── funnel events ─────────────────────────────────────────────────────
-- Lightweight client + server-side telemetry. NOT analytics.
--
-- Why not bring in Mixpanel/Posthog: every external SDK is a vendor
-- dependency + monthly cost + cookie banner + perf hit. Five columns +
-- the profiles join cover every funnel question we have today.
create table if not exists funnel_events (
  id          uuid primary key default gen_random_uuid(),
  event_type  text not null,
  user_id     text,
  session_id  text,
  utm_source  text,
  utm_medium  text,
  utm_campaign text,
  url         text,
  referer     text,
  ip_hash     text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists funnel_events_type_idx on funnel_events (event_type, created_at desc);
create index if not exists funnel_events_user_idx on funnel_events (user_id) where user_id is not null;
create index if not exists funnel_events_source_idx on funnel_events (utm_source) where utm_source is not null;

comment on column funnel_events.event_type is
  'page_view | checkout_started | checkout_completed | territory_check | trial_start | month_2_paid | churned';
comment on column funnel_events.meta is
  'Free-form per-event payload — zip, trade, amount_cents, churn_reason, etc.';
