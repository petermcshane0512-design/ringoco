-- 2026-06-06 — Creator personal-use promo code
--
-- Adds the second of TWO promo codes per creator:
--   public_promo_code            (existing, $200 off first month for fans)
--   personal_promo_code          (NEW, 100% off × 3 months — creator's own sub)
--
-- The personal code is single-use (max_redemptions=1 on Stripe side) so a
-- creator can't share it with friends to get unlimited 3-month-free seats.

ALTER TABLE ig_creator_outreach
  ADD COLUMN IF NOT EXISTS personal_promo_code                TEXT,
  ADD COLUMN IF NOT EXISTS personal_stripe_promotion_code_id  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ig_creator_outreach_personal_promo_code_uidx
  ON ig_creator_outreach (personal_promo_code)
  WHERE personal_promo_code IS NOT NULL;
