-- BellAveGo Schema Migration 006
-- Post-checkout setup wizard state.
-- Each customer is walked through a tier-specific guided flow after Stripe success
-- (forwarding, test call, A2P, CRM, kickoff call) and we track where they are.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS setup_complete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_step integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forwarding_carrier text,           -- 'verizon' | 'att' | 'tmobile' | 'sprint' | 'other'
  ADD COLUMN IF NOT EXISTS forwarding_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_call_received boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS a2p_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS a2p_brand_sid text,
  ADD COLUMN IF NOT EXISTS crm_provider text,                  -- 'jobber' | 'housecallpro' | 'servicetitan' | 'none'
  ADD COLUMN IF NOT EXISTS crm_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS kickoff_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS custom_prompt_notes text;

-- Index for cron that follows up with stalled-onboarding customers
CREATE INDEX IF NOT EXISTS idx_profiles_setup_incomplete
  ON profiles (created_at)
  WHERE is_active = true AND setup_complete = false;
