-- 021_social_engagements.sql
-- =====================================================================
-- Tracks every IG / FB engagement action the Playwright bot performs so we
-- can: (a) avoid re-engaging the same target, (b) enforce daily safety
-- caps, (c) audit ROI / detect ban patterns over time.

CREATE TABLE IF NOT EXISTS social_engagements (
  id              BIGSERIAL PRIMARY KEY,
  platform        TEXT NOT NULL CHECK (platform IN ('instagram','facebook')),
  target_handle   TEXT NOT NULL,
  target_url      TEXT,
  action          TEXT NOT NULL CHECK (action IN ('follow','like','comment','view','join_group')),
  post_id         TEXT,
  comment_text    TEXT,
  source          TEXT,                                  -- e.g. "hashtag:hvac", "competitor:rosie_ai", "lead:abc123"
  status          TEXT NOT NULL CHECK (status IN ('success','failed','blocked','skipped')),
  error_msg       TEXT,
  meta            JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_se_target_platform ON social_engagements (platform, target_handle);
CREATE INDEX IF NOT EXISTS idx_se_created_at      ON social_engagements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_today_success   ON social_engagements (platform, created_at DESC) WHERE status = 'success';
CREATE INDEX IF NOT EXISTS idx_se_action          ON social_engagements (platform, action, created_at DESC);

-- Convenience view: today's successful action counts per platform.
CREATE OR REPLACE VIEW social_engagements_today AS
SELECT
  platform,
  action,
  count(*) AS n
FROM social_engagements
WHERE status = 'success'
  AND created_at >= date_trunc('day', now() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago'
GROUP BY platform, action;

-- RLS off — service role only. Matches the rest of the project's tenant model.
ALTER TABLE social_engagements DISABLE ROW LEVEL SECURITY;
