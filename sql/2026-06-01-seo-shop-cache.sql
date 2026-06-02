-- 2026-06-01 — SEO landing-page shop cache
--
-- The programmatic /answering-service/[trade]-[city] pages render the
-- top 5 shops in that combo. Without a cache we'd hit Google Places
-- once per page load per visitor — expensive AND slow. Cache 7 days.

CREATE TABLE IF NOT EXISTS seo_shop_cache (
  id              SERIAL PRIMARY KEY,
  trade_slug      TEXT NOT NULL,
  city_slug       TEXT NOT NULL,
  shops_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source          TEXT,                                -- 'apify_google_places' | 'manual' etc.
  shop_count      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (trade_slug, city_slug)
);

CREATE INDEX IF NOT EXISTS seo_shop_cache_fetched_at_idx
  ON seo_shop_cache (fetched_at);
