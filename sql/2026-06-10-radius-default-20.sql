-- 2026-06-10 — Drop service_radius_mi default 25 -> 20.
--
-- Matches the new supply-driven ladder in lib/leadEngine.ts +
-- find-real-leads (RADIUS_HARD_CAP_MI = 20). Solo HVAC / plumbing /
-- roofing shops don't drive past 20mi for a residential service call;
-- widening further surfaces leads they won't take, which inflates the
-- "fresh leads delivered" count without delivering value.
--
-- Existing rows preserved as-is — only the default for NEW rows shifts.
-- Tenants who set a custom higher value keep it; the engine clamps to
-- min(profile.service_radius_mi, 20) at query time anyway, so no
-- runtime regression for grandfathered values >20.

alter table profiles
  alter column service_radius_mi set default 20;
