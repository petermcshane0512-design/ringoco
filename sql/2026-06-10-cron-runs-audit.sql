-- 2026-06-10 — cron_runs audit table.
--
-- Reason: per-city permit-scraper cron schedule is `0 5 * * *` (Chicago),
-- `10 5 * * *` (Austin), `40 5 * * *` (Orlando), but observed insertion
-- timestamps were 01:59 UTC and 15:57 UTC — not the scheduled hour.
-- Insertions only happened on 3 of last 14 days for Chicago, 2 of 14 for
-- Austin, 0 for Orlando. Either Vercel cron is failing to invoke, or
-- on-demand admin triggers (discover-for-tenant.fireCityScraper) are the
-- only thing producing rows.
--
-- This table records every invocation at the entry of each cron route,
-- regardless of outcome. Two consecutive days of `mode='vercel_cron'`
-- entries for a given route = scheduled firing proven.

create table if not exists cron_runs (
  id          uuid primary key default gen_random_uuid(),
  route       text not null,                          -- e.g. 'scrape-permits-chicago'
  mode        text not null,                          -- 'vercel_cron' | 'admin_secret' | 'unauthorized'
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  detail      jsonb,                                  -- per-route summary stats
  duration_ms integer
);

create index if not exists cron_runs_route_started_idx
  on cron_runs (route, started_at desc);

create index if not exists cron_runs_mode_idx
  on cron_runs (mode, started_at desc);
