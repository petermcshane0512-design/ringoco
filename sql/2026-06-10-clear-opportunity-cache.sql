-- 2026-06-10 — clear stale opportunity_zip_cache rows.
--
-- The widget's `covered` semantics changed: shared-pool count gate dropped,
-- now covered=true for any US zip (per-tenant BatchData covers any). Any
-- row cached BEFORE this deploy still has the old covered=false value, so
-- 60643 et al keep showing the "we haven't opened" fallback until the row
-- expires.
--
-- Truncate the cache to force fresh compute on next hit.

truncate opportunity_zip_cache;
