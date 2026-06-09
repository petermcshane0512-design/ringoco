-- Server-side click log for bellavego.com/start visits. Catches Apple
-- Mail proxy-stripped clicks that Instantly's pixel misses (~30-40% of
-- iOS users). Also gives us actual time-on-page + bounce-back data.

CREATE TABLE IF NOT EXISTS outreach_link_clicks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path            text NOT NULL,                    -- '/start'
  promo           text,                              -- 'FIRST200', etc.
  ref             text,                              -- creator code if /start?ref=...
  referer         text,
  user_agent      text,
  ip_hash         text,                              -- sha256 of IP for dedup w/o storing raw IP
  matched_email   text,                              -- if we can cross-match to outreach_leads
  matched_outreach_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_link_clicks_path_idx
  ON outreach_link_clicks (path, created_at DESC);
CREATE INDEX IF NOT EXISTS outreach_link_clicks_promo_idx
  ON outreach_link_clicks (promo, created_at DESC) WHERE promo IS NOT NULL;
CREATE INDEX IF NOT EXISTS outreach_link_clicks_matched_idx
  ON outreach_link_clicks (matched_outreach_id) WHERE matched_outreach_id IS NOT NULL;
