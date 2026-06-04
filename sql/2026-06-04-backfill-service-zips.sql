-- 2026-06-04 — backfill service_zips + service_radius_mi for existing tenants
--
-- Every customer who onboarded before the 2026-06-04 lead-engine pivot has
-- NULL service_zips. Lead-engine skips them with skipped_reason='no_service_zips'.
-- This backfills service_zips from their primary zip_code (set at onboarding)
-- and gives a 25mi default radius matching what new signups now get.
--
-- Idempotent — only touches rows where service_zips IS NULL. Re-running is safe.
-- Tenants can override radius later in Settings.

update profiles
set service_zips = array[zip_code],
    service_radius_mi = coalesce(service_radius_mi, 25)
where zip_code is not null
  and zip_code ~ '^\d{5}$'
  and (service_zips is null or array_length(service_zips, 1) is null);

-- Sanity check — should match the count of active tenants with a ZIP set.
select
  count(*) filter (where service_zips is not null) as backfilled,
  count(*) filter (where service_zips is null and is_active = true) as still_missing,
  count(*) filter (where is_active = true) as total_active
from profiles;
