-- BellAveGo Schema Migration 022 — Normalize AI voice + tone to Emma / friendly
--
-- Settings page hides voice + tone pickers and forces Emma (helpful-woman
-- voice ID) + friendly on every NEW save. But legacy rows from before the
-- lockdown (any contractor who picked Marcus/Avery or professional/concise
-- in the old UI) still have those values. This one-time backfill
-- normalizes every existing row so the AI receptionist behaves consistently
-- regardless of legacy DB state.
--
-- Idempotent — safe to re-run. NULL/missing values get the defaults too.
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

-- The Emma voice (Cartesia "Helpful Woman" — see VAPI_VOICE_ID_DEFAULT in src/lib/vapi.ts)
UPDATE profiles
SET ai_voice_id = '156fb8d2-335b-4950-9cb3-a2d33befec77'
WHERE ai_voice_id IS DISTINCT FROM '156fb8d2-335b-4950-9cb3-a2d33befec77';

-- Friendly tone (only supported option in UI)
UPDATE profiles
SET ai_tone = 'friendly'
WHERE ai_tone IS DISTINCT FROM 'friendly';

-- Verify counts (this returns 0 if everything's already normalized)
-- SELECT count(*) FROM profiles WHERE ai_voice_id != '156fb8d2-335b-4950-9cb3-a2d33befec77';
-- SELECT count(*) FROM profiles WHERE ai_tone != 'friendly';
