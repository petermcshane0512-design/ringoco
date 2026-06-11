-- 2026-06-10 — Burned-demo flag.
--
-- 43 sample_reports last 90d rendered the Minneapolis fallback pin
-- (lat 44.9489 lng -93.3479) instead of the prospect's real metro.
-- 8 of the 43 were OPENED by the prospect. Those prospects saw a city
-- ~1800 miles from their own and may have written off the brand.
--
-- Tag them out of all future sends. Do not email an apology — re-flagging
-- a fake to someone who may not have noticed never goes well. If any of
-- them ever replies or you end up on a call, then be honest.

alter table outreach_leads
  add column if not exists burned_demo_at timestamptz,
  add column if not exists burned_demo_reason text;

-- For exclusion at send time, index the flag.
create index if not exists outreach_leads_burned_idx
  on outreach_leads (burned_demo_at)
  where burned_demo_at is not null;
