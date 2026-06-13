-- 2026-06-13 — Daily Zip-Code Intelligence layer
--
-- Per Peter: "come up with some sort of genius algorithm where you're going
-- to look at these every day and then tell me where we're going to find
-- leads. You're going to go find the leads based off of these guys."
--
-- The loop:
--   1. 14 enforcement agents scrape violations every night (4am)
--   2. THIS algorithm runs at 5am — scores every zip by violation density,
--      freshness, trade diversity, and customer-territory openness
--   3. Outputs the day's top 50 zips into daily_zip_targets
--   4. refill-outreach-queue cron (6am) pulls Apify contractor lists from
--      those zips → contractors get queued for cold email
--   5. SMS to Peter at 5:05am: "Today's prospecting orders: 12 new zips,
--      top = Brooklyn 11226 (47 violations this week, 18 roofing)"
--   6. Tonight's cold email targets contractors whose service zip has
--      PROVABLE violation supply → conversion + retention compound

CREATE TABLE IF NOT EXISTS daily_zip_targets (
  id              bigserial PRIMARY KEY,
  run_date        date NOT NULL DEFAULT CURRENT_DATE,
  zip             text NOT NULL,
  city            text,
  state           text,
  rank            int NOT NULL,
  score           numeric NOT NULL,
  -- Component scores so we can debug + tune the algorithm over time.
  last_7d_count   int NOT NULL DEFAULT 0,
  last_30d_count  int NOT NULL DEFAULT 0,
  trade_count     int NOT NULL DEFAULT 0,
  trades          text[],
  has_open_territory boolean NOT NULL DEFAULT true,
  -- Provenance: how many active customers already own this zip+trade?
  -- The algorithm DOESN'T skip filled zips entirely (we still might want
  -- a 2nd shop there for a different trade), it just deprioritizes them.
  active_customers int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_zip_targets_run_date_idx ON daily_zip_targets (run_date DESC, rank);
CREATE INDEX IF NOT EXISTS daily_zip_targets_zip_idx ON daily_zip_targets (zip);

-- One unique constraint so the cron can upsert per day without dupes.
CREATE UNIQUE INDEX IF NOT EXISTS daily_zip_targets_run_zip_uq
  ON daily_zip_targets (run_date, zip);
