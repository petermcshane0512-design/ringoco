-- 2026-06-09 — add business_lat + business_lng to profiles for the
-- 3-mile-radius first-2-weeks lead-engine behavior.
--
-- Per Peter: 'when people sign up the first couple of weeks leads are
-- within 3 miles of their exact working location.' Requires geocoding
-- the business address once at signup.
--
-- Run via Supabase Studio SQL editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS business_lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS business_lng numeric(9,6),
  ADD COLUMN IF NOT EXISTS business_geocoded_at timestamptz;

-- Optional: spatial index for fast lat/lng radius lookups. Doesn't help
-- /api/agents/find-real-leads (that queries BatchData), but useful for
-- any future internal radius reports.
CREATE INDEX IF NOT EXISTS profiles_business_loc_idx
  ON profiles (business_lat, business_lng)
  WHERE business_lat IS NOT NULL;

COMMENT ON COLUMN profiles.business_lat IS 'Geocoded latitude of business_address. Used by find-real-leads to draw a 3mi radius for the first 14 days post-signup, then service_radius_mi after.';
COMMENT ON COLUMN profiles.business_lng IS 'Geocoded longitude pair to business_lat.';
COMMENT ON COLUMN profiles.business_geocoded_at IS 'Timestamp of last successful geocode. NULL if geocoding has not been attempted or has failed.';
