-- ============================================================
-- Driplin migration 0031: alerts that close themselves
--
-- WHY: nothing in Driplin ever marked an alert resolved, and only an
-- admin could acknowledge one -- so a customer had no way to clear
-- anything, ever. Measured on a real four-property account: seventeen
-- unacknowledged alerts in thirteen days. Twelve of them said "schedule
-- was out of compliance and has been corrected automatically", which is
-- news about something already fixed, filed permanently under
-- "unacknowledged".
--
-- At forty properties that is thousands a year, every one open forever,
-- and the count on the dashboard means nothing inside a month. Which
-- defeats the thing the whole product rests on: that when Driplin says
-- something, it matters.
--
-- resolved_at is deliberately NOT the same as acknowledged. Acknowledged
-- means a person dismissed it. Resolved means the problem went away. Both
-- are worth knowing, and conflating them would lose the distinction
-- between "somebody dealt with this" and "it stopped being true".
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

alter table public.alerts
  add column resolved_at timestamptz,
  add column resolved_reason text;

-- Every dashboard read asks for the open ones, so index exactly that.
create index alerts_open_for_org_idx
  on public.alerts (org_id, created_at desc)
  where acknowledged = false and resolved_at is null;

comment on column public.alerts.resolved_at is
  'Set when the underlying problem stopped being true, by Driplin rather than by a person. Distinct from acknowledged, which means somebody dismissed it.';

-- ------------------------------------------------------------
-- Close the backlog this change exists to prevent.
--
-- Every open alert announcing an automatic correction is, by its own
-- wording, about something already fixed. Leaving them would mean
-- shipping the fix and keeping the mess it was meant to clear.
-- ------------------------------------------------------------
update public.alerts
set resolved_at = now(),
    resolved_reason = 'Driplin corrected this automatically at the time'
where type = 'violation'
  and severity = 'info'
  and resolved_at is null
  and acknowledged = false;
