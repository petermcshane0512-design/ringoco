-- 2026-06-09 — 7 new profile columns for "unbreakable" 17-step onboarding.
-- Apply in Supabase Studio. These let the lead engine filter BatchData /
-- Apify outputs to ONLY surface leads that match each contractor's ICP
-- exactly.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sub_specialties        text[],   -- 'AC install', 'heat pump', 'mini-split', 'commercial RTU', 'drain cleaning', etc
  ADD COLUMN IF NOT EXISTS manufacturer_certs     text[],   -- 'Carrier dealer', 'Trane factory authorized', 'Rheem Pro Partner', etc
  ADD COLUMN IF NOT EXISTS avg_ticket_cents       int,      -- their typical job size in cents (drives lead-property-value matching)
  ADD COLUMN IF NOT EXISTS work_days              text[],   -- ['mon','tue','wed','thu','fri','sat'] etc
  ADD COLUMN IF NOT EXISTS work_hours_start       text,     -- '07:00'
  ADD COLUMN IF NOT EXISTS work_hours_end         text,     -- '19:00'
  ADD COLUMN IF NOT EXISTS equipment_capabilities text[],   -- 'EPA 608', 'NATE', 'ductwork install', 'IAQ certified', 'low-volt license'
  ADD COLUMN IF NOT EXISTS ideal_customer_desc    text,     -- 1-line free text — feeds lookalike-finder agent
  ADD COLUMN IF NOT EXISTS exclusions             text[];   -- 'no commercial', 'no new construction', 'no warranty work', 'no rental properties'
