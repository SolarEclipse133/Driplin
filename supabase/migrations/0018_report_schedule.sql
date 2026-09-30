-- ============================================================
-- Driplin migration 0018: scheduled board reports
--
-- WHY: the board report is the artifact a manager actually hands to a
-- client, and it currently requires somebody to remember to download
-- it. It is also the thing that keeps Driplin visible in January, when
-- nobody is thinking about drought and the product otherwise looks
-- like a line item to cut.
--
-- Two columns on the organization. Quarterly by default because that
-- is how often HOA boards meet.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

alter table public.organizations
  add column report_frequency text not null default 'quarterly'
  constraint report_frequency_valid
    check (report_frequency in ('off', 'monthly', 'quarterly'));

-- Null means none has been sent yet. The scheduler treats that as due,
-- so a new customer gets their first report rather than waiting a
-- quarter to find out the feature exists.
alter table public.organizations
  add column reports_last_sent_at timestamptz;

comment on column public.organizations.report_frequency is
  'How often board reports are emailed to members. Never affects monitoring.';
