-- Add address columns to jobs + customers
-- =====================================================================
-- Emma now captures the service address on every call (see take_message
-- tool schema in src/lib/vapi.ts). Without these columns, the webhook
-- INSERT errors and the ENTIRE lead-capture flow bails: no SMS, no
-- contractor email, no job row, no customer record. The end-of-call
-- email then incorrectly says "no message captured" because job_created
-- never got flipped to true.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS — safe to re-run.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN jobs.address IS
  'Service address Emma captured from the caller (street + city, format as said). '
  'Used for lead-alert SMS + email so the contractor knows where to go.';

COMMENT ON COLUMN customers.address IS
  'Service address for this customer. Set on first call; not auto-updated on '
  'subsequent calls to preserve manual edits.';

-- Sanity check — both should return rows
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name = 'address' AND table_name IN ('jobs', 'customers')
ORDER BY table_name;
