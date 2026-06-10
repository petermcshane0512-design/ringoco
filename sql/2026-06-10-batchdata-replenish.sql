-- 2026-06-10 — last_batchdata_replenish_at cooldown column.
--
-- Lead engine fires find-real-leads inline when a tenant's candidate pool
-- has drained (candidates.length === 0). Without this column we'd have no
-- cooldown, and the hourly lead-engine cron would burn $6 per hour per
-- empty-pool tenant. With it: 24h floor between auto-refills.

alter table profiles
  add column if not exists last_batchdata_replenish_at timestamptz;

create index if not exists profiles_last_replenish_idx
  on profiles (last_batchdata_replenish_at desc nulls first);
