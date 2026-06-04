-- 2026-06-04 — fix lead_drops.user_id + profile_id type mismatch
--
-- The original table created user_id + profile_id as `uuid NOT NULL`,
-- but Clerk user IDs are strings like 'user_3DGWtNcz6phakI4omRf7e1ZSbPz'
-- which can't be cast to uuid. Every lead-engine drop attempt failed with
-- the cryptic "insert_failed" reason.
--
-- Convert both columns to text. Lead_id stays uuid (leads.id is real uuid).
-- Safe — no production rows yet (0 lead_drops). Idempotent.

-- Must drop the view first — Postgres won't alter a column type used by
-- a dependent view, even with CASCADE on the alter.
drop view if exists tenant_lead_quota_usage cascade;

alter table lead_drops
  alter column user_id type text using user_id::text,
  alter column profile_id type text using profile_id::text;

create view tenant_lead_quota_usage as
select
  user_id,
  count(*) filter (where drop_date >= date_trunc('week',  current_date))::int  as leads_this_week,
  count(*) filter (where drop_date >= date_trunc('month', current_date))::int  as leads_this_month,
  count(*) filter (where drop_date >= date_trunc('quarter', current_date))::int as leads_this_quarter,
  count(*)::int as leads_total
from lead_drops
where status in ('new','contacted','quoted','won')
group by user_id;
