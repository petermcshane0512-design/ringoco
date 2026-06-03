-- Make email nullable so phone-only leads can be inserted.
-- Pre-Jun-16 (cold email warmup window) we ingest phone-only ICP shops
-- scraped from Google Maps where email isn't surfaced. Email becomes
-- required again at the Instantly-push step (auto-load cron already
-- filters `.not('email', 'is', null)`), so this only loosens the ingest
-- gate, not the send gate.

alter table outreach_leads
  alter column email drop not null;
