-- Adds tracking columns for the one-tap "send report SMS" feature.
-- Powers /api/admin/send-report-sms — set when Peter taps the xlsx link
-- during a cold call.

alter table outreach_leads
  add column if not exists last_report_sms_sent_at timestamptz;

-- For quickly listing leads where Peter sent the report today.
create index if not exists outreach_leads_report_sms_idx
  on outreach_leads (last_report_sms_sent_at desc nulls last);
