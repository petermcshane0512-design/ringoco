-- Stores periodic snapshots from /api/crons/health-monitor.
-- Lets Peter scroll back through "what did Twilio balance look like Friday?"
-- without paying for a logging SaaS.

create table if not exists health_snapshots (
  id           uuid primary key default gen_random_uuid(),
  checked_at   timestamptz not null default now(),
  summary      jsonb not null,
  checks       jsonb not null
);

create index if not exists health_snapshots_checked_at_idx
  on health_snapshots (checked_at desc);

-- Trim to last 30 days so the table doesn't bloat.
-- Run manually or via cron; we don't enforce automatically.
-- delete from health_snapshots where checked_at < now() - interval '30 days';
