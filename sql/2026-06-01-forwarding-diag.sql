-- 2026-06-01 — Forwarding test diagnostics
--
-- Capture WHO Twilio reports as the caller on the forward-test leg so
-- carrier-specific CLI-rewrite issues are debuggable from the profile row.
--
-- Some GSM/MVNO carriers and a slice of Verizon CNAM paths replace the
-- From= header on a no-answer forward leg with their own routing CLI or
-- the forwarding subscriber's own number. The verify route was previously
-- strict-matching From= against TWILIO_PHONE_NUMBER and failing on these
-- carriers. Widening detection — but logging what we actually saw so we
-- can build a list of carrier oddities and respond to support escalations.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS forwarding_test_from TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS forwarding_test_strict_match BOOLEAN;
