-- 024_native_calendar.sql
-- =====================================================================
-- Native BellAveGo calendar. Promotes the jobs table to first-class
-- source of truth for scheduling. AI books here, manual entries land
-- here, Google/Microsoft become OPTIONAL sync-out destinations.
--
-- New columns:
--   scheduled_at      TIMESTAMPTZ — real start of the appointment (UTC)
--   scheduled_end_at  TIMESTAMPTZ — real end (start + duration)
--   duration_min      INT         — denormalized for fast slot math
--   block_type        TEXT        — 'job' (default) | 'block' | 'lunch' | 'vacation' | 'personal'
--   created_via       TEXT        — 'ai' | 'manual' | 'recurring' | 'sync_in'
--   color_tag         TEXT        — optional hex / palette key for UI
--   notes_internal    TEXT        — contractor's private notes (not in confirmations)
--   external_event_id TEXT        — Google/MS event id when we ALSO sync the row out
--   external_provider TEXT        — 'google' | 'microsoft' | NULL
--
-- We do NOT drop the legacy `scheduled_time` text column — older AI
-- booking code still writes to it for human-readable display ("Tuesday,
-- May 21, 2 PM"). Both coexist; native calendar reads `scheduled_at`.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS scheduled_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_end_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_min       INT,
  ADD COLUMN IF NOT EXISTS block_type         TEXT DEFAULT 'job' CHECK (block_type IN ('job','block','lunch','vacation','personal')),
  ADD COLUMN IF NOT EXISTS created_via        TEXT DEFAULT 'ai' CHECK (created_via IN ('ai','manual','recurring','sync_in')),
  ADD COLUMN IF NOT EXISTS color_tag          TEXT,
  ADD COLUMN IF NOT EXISTS notes_internal     TEXT,
  ADD COLUMN IF NOT EXISTS external_event_id  TEXT,
  ADD COLUMN IF NOT EXISTS external_provider  TEXT CHECK (external_provider IN ('google','microsoft') OR external_provider IS NULL);

-- Composite index for the calendar view query — fetch all of one
-- contractor's appointments inside a window in O(log n + k).
CREATE INDEX IF NOT EXISTS idx_jobs_user_scheduled_at
  ON jobs (user_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- Index for the "what's on the dashboard agenda right now" query.
CREATE INDEX IF NOT EXISTS idx_jobs_user_status_scheduled
  ON jobs (user_id, status, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- Best-effort backfill: parse the legacy scheduled_time text into
-- scheduled_at where possible. Format observed in production is the
-- output of formatSlotForHumans() in src/app/api/calendar/book/route.ts:
--   "Tuesday, May 21, 2:00 PM"
-- Postgres can't reliably parse that without the year; we leave NULLs
-- alone. Future AI bookings will populate scheduled_at directly.

-- Optional: write a default 90-minute duration into scheduled_end_at for
-- any row that already has scheduled_at but no end. This makes existing
-- AI-booked rows appear correctly on the calendar.
UPDATE jobs
SET scheduled_end_at = scheduled_at + INTERVAL '90 minutes',
    duration_min     = COALESCE(duration_min, 90)
WHERE scheduled_at IS NOT NULL
  AND scheduled_end_at IS NULL;
