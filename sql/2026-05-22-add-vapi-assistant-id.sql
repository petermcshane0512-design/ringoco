-- Per-tenant Vapi assistant binding
-- =====================================================================
-- Adds two columns to profiles so each paying contractor gets their own
-- dedicated Vapi assistant resource (NOT the shared sales assistant).
--
--   vapi_assistant_id            — Vapi resource ID of the contractor's
--                                  per-tenant assistant. NULL until
--                                  provisionNumberForUser successfully
--                                  creates one (Stripe webhook fires this
--                                  on checkout.session.completed).
--
--   vapi_assistant_creation_error — last error string if assistant
--                                  creation failed. NULL when healthy.
--                                  Surfaced to the provision-retry cron
--                                  + admin dashboards so a stuck tenant
--                                  is visible instead of silently
--                                  routing to the wrong assistant.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS — safe to re-run.
--
-- See docs/architecture/vapi-tenant-provisioning.md for the architecture
-- rationale (shared-assistant + per-call override path failed on Vapi's
-- side; per-tenant assistants are the workaround).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vapi_assistant_id TEXT,
  ADD COLUMN IF NOT EXISTS vapi_assistant_creation_error TEXT;

COMMENT ON COLUMN profiles.vapi_assistant_id IS
  'Vapi resource ID of this contractor''s per-tenant assistant. NULL '
  'before successful provision. The shared sales assistant '
  '(VAPI_ASSISTANT_ID env var, cccc9db9-...) is for the demo line ONLY '
  'and is never written here.';

COMMENT ON COLUMN profiles.vapi_assistant_creation_error IS
  'Last error message from a failed Vapi assistant creation attempt. '
  'NULL when healthy. Inspected by provision-retry cron + the admin '
  'provisioning dashboard so stuck tenants don''t silently route to '
  'the wrong assistant.';

-- Sanity check — should return 2 rows after running
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('vapi_assistant_id', 'vapi_assistant_creation_error')
ORDER BY column_name;
