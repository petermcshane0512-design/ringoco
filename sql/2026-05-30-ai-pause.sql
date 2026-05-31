-- 2026-05-30 — user-controlled AI receptionist pause.
--
-- Single nullable column. NULL = receptionist active. Future timestamptz =
-- paused until then. Year 9999 = paused indefinitely.
--
-- Voice handler checks this BEFORE running Claude. If paused, plays a
-- one-line greeting + dial owner_phone so the caller still reaches a human.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_paused_until timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_pause_mode text DEFAULT 'forward';
  -- 'forward' = dial owner_phone after one-line greeting
  -- 'voicemail' = play greeting + record voicemail + hangup
  -- 'silent' = no greeting, just hangup (rare)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_paused_reason text;
  -- Optional user-supplied reason ('on vacation', 'fielding calls myself', etc).

CREATE INDEX IF NOT EXISTS profiles_ai_paused_until_idx
  ON profiles (ai_paused_until) WHERE ai_paused_until IS NOT NULL;
