-- 2026-06-05 — young owner scoring + ICP narrowing
--
-- Peter's June 5 cold-call insight: old HVAC owners (>40yo, 20+yr shops)
-- won't trust AI. Under-35 founders convert. Pivot Instantly campaign
-- to ONLY send to young-owner-flagged leads starting June 16.
--
-- young_owner_score: 0-100 composite. 40+ = include in Instantly send.
-- young_signals: per-signal breakdown for debugging + iteration.

alter table outreach_leads
  add column if not exists young_owner_score integer,
  add column if not exists young_signals jsonb,
  add column if not exists young_scored_at timestamptz;

create index if not exists outreach_leads_young_score_idx
  on outreach_leads (young_owner_score desc nulls last)
  where young_owner_score is not null;
