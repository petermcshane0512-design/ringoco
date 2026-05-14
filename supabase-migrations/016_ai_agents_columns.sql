-- AI agents build (May 2026) — adds columns for support agent, voice tuning,
-- emergency escalation, and onboarding coach. All idempotent.
--
-- Run once in Supabase SQL editor.

-- profiles: voice tuning + backup escalation + onboarding coach tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_voice_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS backup_owner_phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_day3_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_day7_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vapi_phone_number_id text;

-- jobs: emergency-escalation tracking
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_escalated_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_call_sid text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_fallback_sent_at timestamptz;

-- support_tickets: AI auto-response tracking
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ai_attempted_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ai_confidence numeric;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ai_topic text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ai_escalate_reason text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_by text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
