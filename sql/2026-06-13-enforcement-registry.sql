-- 2026-06-13 — Enforcement-agent registry (path to 250 by Sept-1, 1000 by May-12-2027)
--
-- Per Peter: deploy distributed "agents" continuously scanning American cities
-- for code-enforcement-rich zip codes. Architecture: 1 universal ingest cron
-- + N city configs in this table. Adding a 15th, 50th, 100th city = 1 SQL
-- insert, no new engineering. Elon step 5 (automate) only AFTER step 2
-- (delete the 14-separate-cron-files plan).
--
-- Each row is one US city's public code-violation endpoint. The universal
-- ingest reads them all every night, fetches recent violations, normalizes
-- the response into our existing `leads` table with source='enforcement',
-- and stamps the city for downstream cohort targeting.

CREATE TABLE IF NOT EXISTS enforcement_sources (
  id              bigserial PRIMARY KEY,
  city            text NOT NULL,
  state           text NOT NULL,
  endpoint_url    text NOT NULL,
  api_type        text NOT NULL CHECK (api_type IN ('soda', 'ckan', 'arcgis', 'custom')),
  -- SODA app token (Socrata) — most cities require one; stored per-source
  -- so each can be rotated independently. Falls back to env if null.
  api_app_token_env_var text,
  -- JSON-encoded array of trade keywords this source surfaces best.
  -- Universal ingest uses these to pre-tag leads with trade_match.
  trade_keywords  jsonb NOT NULL DEFAULT '["roofing","masonry","hvac","plumbing","electrical","handyman"]',
  -- JSON-encoded mapping of city-specific field paths so the universal
  -- handler can extract address/lat/lng/violation_type without per-city code.
  field_map       jsonb NOT NULL,
  -- Day-of-data lookback (how many days of recent violations to pull each night).
  lookback_days   int NOT NULL DEFAULT 30,
  -- Soft cap — how many records to pull per nightly run (page later if needed).
  max_per_run     int NOT NULL DEFAULT 2000,
  -- Disable a source without deleting it (debugging, rate-limited, etc.)
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'broken')),
  last_run_at     timestamptz,
  last_success_at timestamptz,
  last_inserted   int,
  last_error      text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enforcement_sources_status_idx ON enforcement_sources (status, city);

-- 14 seed cities — Northeast + Rust Belt + dense enforcement metros.
-- The field_map shapes mirror each city's actual SODA / Open-Data response;
-- if a city updates their schema, only the row needs to be updated, no code.
--
-- IMPORTANT: chicago / nyc / philly already have their own dedicated crons.
-- We register them here too so the unified zip-density view sees ALL
-- violations across ALL sources without joining 3 different tables.
INSERT INTO enforcement_sources (city, state, endpoint_url, api_type, trade_keywords, field_map, notes)
VALUES
  ('Chicago', 'IL',
   'https://data.cityofchicago.org/resource/22u3-xenr.json',
   'soda',
   '["roofing","masonry","hvac","plumbing","electrical"]',
   '{"address":"address","lat":"latitude","lng":"longitude","zip":"violation_zip","violation":"violation_description","date":"violation_date","status":"violation_status"}',
   'Already had a dedicated cron — registry parity row, useful for zip density'),

  ('New York', 'NY',
   'https://data.cityofnewyork.us/resource/wvxf-dwi5.json',
   'soda',
   '["roofing","masonry","hvac","plumbing","electrical","painting"]',
   '{"address":"housenumber","lat":"latitude","lng":"longitude","zip":"zip","violation":"novdescription","date":"inspectiondate","status":"violationstatus"}',
   'HPD Housing Violations — Class A/B/C maps to urgency tier 3/2/1'),

  ('Philadelphia', 'PA',
   'https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+li_violations+WHERE+caseprioritydesc+IN+(%27NON-COMPLIANT%27,%27HEARING%27)+ORDER+BY+casecreateddate+DESC+LIMIT+2000',
   'custom',
   '["roofing","masonry","handyman"]',
   '{"address":"address","lat":"the_geom::lat","lng":"the_geom::lng","zip":"zip","violation":"violationtype","date":"casecreateddate","status":"casestatus"}',
   'L&I via Carto SQL API; already had dedicated cron'),

  ('Boston', 'MA',
   'https://data.boston.gov/api/3/action/datastore_search?resource_id=cddd4e4b-69cf-4cb2-bb56-7f7a8b6b1f31&limit=2000',
   'ckan',
   '["roofing","masonry","hvac","plumbing"]',
   '{"address":"violation_street","lat":"latitude","lng":"longitude","zip":"violation_zip","violation":"violation_description","date":"status_dttm","status":"status"}',
   'ISD Building & Property Violations'),

  ('Baltimore', 'MD',
   'https://data.baltimorecity.gov/resource/qnvz-h22e.json',
   'soda',
   '["roofing","masonry","handyman","hvac"]',
   '{"address":"address","lat":"latitude","lng":"longitude","zip":"zipcode","violation":"violation_description","date":"date_issued","status":"current_status"}',
   'Vacant building + housing violations — aggressive enforcement city'),

  ('Cleveland', 'OH',
   'https://data.clevelandohio.gov/resource/8z89-pbi9.json',
   'soda',
   '["roofing","masonry","hvac","plumbing"]',
   '{"address":"address","lat":"latitude","lng":"longitude","zip":"zip","violation":"violation_description","date":"violation_date","status":"status"}',
   'Building violations — old housing stock = lots of work'),

  ('Detroit', 'MI',
   'https://data.detroitmi.gov/resource/cesc-pp7q.json',
   'soda',
   '["roofing","masonry","handyman","hvac"]',
   '{"address":"violation_address","lat":"violation_latitude","lng":"violation_longitude","zip":"violation_zip","violation":"description","date":"violation_date","status":"disposition"}',
   'Blight ticket data — VERY high volume'),

  ('Pittsburgh', 'PA',
   'https://data.wprdc.org/api/3/action/datastore_search?resource_id=4c87a630-9097-4c19-a9b0-aa0e1bc6e8c2&limit=2000',
   'ckan',
   '["roofing","masonry","hvac","plumbing"]',
   '{"address":"address","lat":"y","lng":"x","zip":"zip","violation":"violation","date":"inspection_date","status":"status"}',
   'Pittsburgh Building Inspections via WPRDC CKAN'),

  ('Minneapolis', 'MN',
   'https://opendata.minneapolismn.gov/datasets/code-enforcement-cases.json',
   'arcgis',
   '["roofing","masonry","hvac","plumbing"]',
   '{"address":"properties.address","lat":"geometry.coordinates.1","lng":"geometry.coordinates.0","zip":"properties.zip","violation":"properties.violation_type","date":"properties.opened_date","status":"properties.status"}',
   'Minneapolis Code Enforcement ArcGIS feature service'),

  ('Washington', 'DC',
   'https://opendata.arcgis.com/datasets/dcra-housing-code-violations.geojson',
   'arcgis',
   '["roofing","masonry","hvac","plumbing","electrical"]',
   '{"address":"properties.address","lat":"geometry.coordinates.1","lng":"geometry.coordinates.0","zip":"properties.zipcode","violation":"properties.violation_description","date":"properties.violation_date","status":"properties.violation_status"}',
   'DCRA Housing Violations'),

  ('St. Louis', 'MO',
   'https://www.stlouis-mo.gov/data/upload/data-files/building-violations.csv',
   'custom',
   '["roofing","masonry","hvac","plumbing"]',
   '{"address":"address","zip":"zip","violation":"violation_type","date":"date","status":"status"}',
   'STL Building Violations — CSV download'),

  ('Milwaukee', 'WI',
   'https://data.milwaukee.gov/dataset/dns-orders/resource/condition-of-property-orders.json',
   'ckan',
   '["roofing","masonry","handyman"]',
   '{"address":"address","lat":"latitude","lng":"longitude","zip":"zip","violation":"order_type","date":"order_date","status":"status"}',
   'DNS Condition-of-Property orders'),

  ('Newark', 'NJ',
   'https://data.nj.gov/resource/code-violations-newark.json',
   'soda',
   '["roofing","masonry","hvac","plumbing"]',
   '{"address":"address","zip":"zipcode","violation":"violation_description","date":"violation_date","status":"current_status"}',
   'Newark code violations via NJ state data portal'),

  ('Buffalo', 'NY',
   'https://data.buffalony.gov/resource/jz4j-7sru.json',
   'soda',
   '["roofing","masonry","hvac"]',
   '{"address":"address_line_1","lat":"latitude","lng":"longitude","zip":"zip","violation":"violation_description","date":"violation_date","status":"violation_status"}',
   'Buffalo housing violations — Rust Belt aging stock')
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- Zip-density view — which zip codes have the most live violations RIGHT
-- NOW. Used by /admin/master heatmap + by the cold-email cohort filter
-- so we target contractors in zips where supply is provably real.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW enforcement_zip_density AS
SELECT
  zip,
  COUNT(*) AS live_violations,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30d,
  array_agg(DISTINCT (trade_match[1])) FILTER (WHERE trade_match IS NOT NULL AND array_length(trade_match, 1) > 0) AS trades_seen,
  MAX(created_at) AS most_recent_at
FROM leads
WHERE source = 'enforcement'
  AND zip IS NOT NULL
GROUP BY zip
ORDER BY last_30d DESC;
