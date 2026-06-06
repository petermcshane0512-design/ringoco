-- 2026-06-06 — Creator referral payout columns
--
-- One-time + recurring tracking for the named-creator-code referral engine.
-- Each creator gets their own Stripe promotion_code (vanity, derived from
-- their IG handle) that points at the shared $200-off-first-month coupon.
-- When their fan's SECOND paid month clears, BellAveGo owes the creator
-- $200 cash on the next Friday batch.
--
-- All money columns are in CENTS to dodge floating-point footguns. UI/dashboards
-- divide by 100 for display.

------------------------------------------------------------------------------
-- ig_creator_outreach: per-creator promo code + payout balances
------------------------------------------------------------------------------
ALTER TABLE ig_creator_outreach
  ADD COLUMN IF NOT EXISTS promo_code               TEXT,
  ADD COLUMN IF NOT EXISTS stripe_promotion_code_id TEXT,
  ADD COLUMN IF NOT EXISTS pending_payout_cents     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payable_friday_cents     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_paid_cents      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payout_at           TIMESTAMPTZ;

-- Unique constraint on promo_code so two creators can never collide on the
-- same vanity string. NULL allowed so existing rows without codes don't break.
CREATE UNIQUE INDEX IF NOT EXISTS ig_creator_outreach_promo_code_uidx
  ON ig_creator_outreach (promo_code)
  WHERE promo_code IS NOT NULL;

------------------------------------------------------------------------------
-- profiles: track first + second paid-invoice timestamps per subscriber
--
-- first_paid_charge_at  = day fan's first non-trial $97 invoice cleared
-- second_paid_charge_at = day fan's second $297 invoice cleared
--                         (this is the trigger that moves their referring
--                          creator's $200 from `pending_payout_cents` to
--                          `payable_friday_cents`)
-- referred_by_promo_code = denormalized handle of the creator who referred
--                          them, copied off the subscription's Stripe
--                          promotion_code at checkout time
------------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_paid_charge_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS second_paid_charge_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referred_by_promo_code  TEXT;

-- Fast lookup when the webhook needs to find a subscriber by referring code.
CREATE INDEX IF NOT EXISTS profiles_referred_by_promo_code_idx
  ON profiles (referred_by_promo_code)
  WHERE referred_by_promo_code IS NOT NULL;

------------------------------------------------------------------------------
-- creator_payouts: audit log of every ACH the Friday cron fires
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creator_payouts (
  id                BIGSERIAL PRIMARY KEY,
  creator_id        UUID        REFERENCES ig_creator_outreach(id) ON DELETE SET NULL,
  promo_code        TEXT,
  amount_cents      INTEGER     NOT NULL CHECK (amount_cents > 0),
  ref_count         INTEGER     NOT NULL CHECK (ref_count > 0),
  batch_friday      DATE        NOT NULL,
  paid_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_method    TEXT,                       -- 'stripe_connect' | 'csv_export' | 'manual_ach'
  external_ref      TEXT,                       -- Stripe transfer id, CSV row, etc.
  notes             TEXT
);

CREATE INDEX IF NOT EXISTS creator_payouts_creator_id_idx ON creator_payouts (creator_id);
CREATE INDEX IF NOT EXISTS creator_payouts_batch_friday_idx ON creator_payouts (batch_friday);
