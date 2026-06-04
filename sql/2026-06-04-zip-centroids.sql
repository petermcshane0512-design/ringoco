-- 2026-06-04 — ZIP centroid table for radius-based lead routing
--
-- Lets the lead engine answer: "given customer's primary ZIP + radius,
-- what ZIPs should we pull leads from?" Without geocoding every lead
-- individually (Google Maps API $5/1K) we use the ZIP centroid as a
-- ~5-mile approximation.
--
-- Source: US Census ZCTA (Zip Code Tabulation Areas) — public, free.
-- Imported separately via scripts/load-zip-centroids.mjs (loads ~42K ZIPs).

create table if not exists zip_centroids (
  zip       text primary key,
  city      text,
  state     text,
  lat       numeric(10, 6) not null,
  lng       numeric(10, 6) not null,
  population integer,
  -- Median home age (years) — derived from Census ACS for aging-HVAC math.
  -- Refreshed quarterly when ACS releases new estimates.
  median_home_age integer,
  -- Estimated households in this ZIP (covers single-family + multi-unit).
  households integer,
  updated_at timestamptz not null default now()
);

create index if not exists zip_centroids_state_idx on zip_centroids (state);
create index if not exists zip_centroids_geo_idx on zip_centroids (lat, lng);

-- Helper: ZIPs within X miles of a given ZIP (uses haversine approximation
-- on lat/lng — accurate enough for the 5-100 mile radius range we care about).
-- Used by /api/crons/lead-engine when filtering leads by service area.
create or replace function zips_within_miles(primary_zip text, radius_mi integer)
returns table (zip text, dist_mi numeric) as $$
  with primary as (select lat, lng from zip_centroids where zip = primary_zip)
  select
    z.zip,
    round(
      3959 * acos(
        cos(radians(p.lat)) * cos(radians(z.lat)) *
        cos(radians(z.lng) - radians(p.lng)) +
        sin(radians(p.lat)) * sin(radians(z.lat))
      )::numeric, 2
    ) as dist_mi
  from zip_centroids z, primary p
  where z.zip != primary_zip
  having round(
    3959 * acos(
      cos(radians(p.lat)) * cos(radians(z.lat)) *
      cos(radians(z.lng) - radians(p.lng)) +
      sin(radians(p.lat)) * sin(radians(z.lat))
    )::numeric, 2
  ) <= radius_mi;
$$ language sql stable;
