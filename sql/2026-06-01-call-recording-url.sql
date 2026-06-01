-- 2026-06-01 — Call recording URL on call_logs
--
-- Vapi sends a recordingUrl on every end-of-call-report event. Persisting
-- it on call_logs lets the dashboard activity feed render a "▶ Listen"
-- button per call so contractors can hear exactly what their AI said and
-- what the caller said.
--
-- Same shape as outreach_calls.recording_url (warm-caller webhook already
-- uses this pattern).

ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS recording_url TEXT;
