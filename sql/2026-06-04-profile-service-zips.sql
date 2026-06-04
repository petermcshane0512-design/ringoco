-- 2026-06-04 — Per-customer geo + trade routing for lead engine
--
-- Adds the columns the lead-engine cron needs to ZIP-filter leads per
-- tenant. Without this, every customer would see leads from every
-- ZIP we ingest — useless for an HVAC owner in Phoenix to get a
-- permit in Houston.
--
-- service_zips    — ZIPs the contractor actively services (1-5 typical)
-- service_radius_mi — fallback radius from primary ZIP when service_zips
--                     is empty (covers small-town Elite tenants)

alter table profiles
  add column if not exists service_zips text[] default '{}',
  add column if not exists service_radius_mi integer default 25;

-- GIN index for fast `zip IN service_zips` filtering in the lead-engine cron.
create index if not exists profiles_service_zips_idx
  on profiles using gin (service_zips);
