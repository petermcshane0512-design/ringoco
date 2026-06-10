-- 2026-06-10 — Territory enforcement (T3 of offer-rebuild plan).
--
-- Makes the "one shop per area" exclusivity claim mechanically real.
-- Each (zip, trade) is a single sellable territory. A customer claims a
-- territory when their Stripe checkout completes. Cancellation moves it
-- to a 14-day grace window so we don't double-sell during a billing
-- glitch, then flips back to open.
--
-- Companion to: src/lib/territory.ts + /api/territory/* + Stripe webhook
-- claim/release hooks + /api/crons/territory-release-grace.
--
-- Run this in Supabase SQL editor BEFORE deploying the API routes.

-- The territories themselves.
CREATE TABLE IF NOT EXISTS territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zip TEXT NOT NULL,
  trade TEXT NOT NULL,
  metro TEXT,                            -- optional grouping label (e.g. 'Phoenix AZ')
  status TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'claimed' | 'grace'
  customer_id TEXT,                      -- Clerk user_id of the owner (when claimed/grace)
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  claimed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,               -- when status='grace': moment grace expires → 'open'
  business_name TEXT,                    -- denormalized for admin view convenience
  CONSTRAINT territories_zip_trade_unique UNIQUE (zip, trade),
  CONSTRAINT territories_status_check CHECK (status IN ('open', 'claimed', 'grace'))
);

CREATE INDEX IF NOT EXISTS territories_status_idx ON territories(status);
CREATE INDEX IF NOT EXISTS territories_customer_idx ON territories(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS territories_grace_release_idx ON territories(released_at) WHERE status = 'grace';

COMMENT ON TABLE territories IS 'Exclusive (zip, trade) territory ownership. Claimed on Stripe checkout completed. Cancellation → 14-day grace → open.';
COMMENT ON COLUMN territories.status IS 'open: sellable. claimed: held by customer with active sub. grace: customer cancelled/refunded, holds until released_at then flips to open.';
COMMENT ON COLUMN territories.released_at IS 'When status=grace: the wall-clock time territory_release_grace cron will flip status back to open.';

-- Waitlist for customers whose desired (zip, trade) is taken.
CREATE TABLE IF NOT EXISTS territory_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zip TEXT NOT NULL,
  trade TEXT NOT NULL,
  email TEXT NOT NULL,
  business_name TEXT,
  source TEXT,                           -- 'start_area' | 'admin' | 'other'
  notified_at TIMESTAMPTZ,               -- timestamp when we emailed them "your area opened up"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS territory_waitlist_zip_trade_idx ON territory_waitlist(zip, trade);
CREATE INDEX IF NOT EXISTS territory_waitlist_email_idx ON territory_waitlist(email);
CREATE UNIQUE INDEX IF NOT EXISTS territory_waitlist_unique_idx ON territory_waitlist(zip, trade, email);

COMMENT ON TABLE territory_waitlist IS 'Email capture when a prospect picks a (zip, trade) that is already claimed/grace. Notified by territory_release_grace cron when territory opens.';
