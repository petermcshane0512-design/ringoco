-- 2026-06-01 — Custom Emma greeting style
--
-- Lets contractors pick how Emma opens every call (or write their own).
-- Computed into firstMessage by /api/vapi/assistant-request at call time
-- so the AI doesn't need to be re-deployed on changes.
--
-- Values:
--   'friendly_intro'    → Hi, this is Emma with {business}. {owner} is out on a job — how can I help?
--   'thanks_for_calling' → Thanks for calling {business}, this is Emma — how can I help you?
--   'business_first'    → Hi, you've reached {business}. Emma speaking — what can I do for you?
--   'custom'            → uses ai_greeting_custom column verbatim (with {business}/{owner} placeholders)
--
-- Default = 'friendly_intro' to preserve existing behavior for already-live
-- contractors. NULL behaves the same as 'friendly_intro' in the route.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_greeting_style TEXT DEFAULT 'friendly_intro';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_greeting_custom TEXT;
