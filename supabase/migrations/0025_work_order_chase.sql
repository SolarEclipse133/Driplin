-- ============================================================
-- Driplin migration 0025: chase work orders nobody acted on
--
-- WHY: Driplin found the problem, handed it to a landscaper, and then
-- quietly hoped. A work order sat at status 'open' indefinitely -- the
-- vendor never opened the link, or opened it and did nothing -- while
-- the property kept watering illegally and the manager assumed it had
-- been dealt with. There was no escalation code anywhere.
--
-- The product's claim is that nothing silently stays broken. Handing a
-- task to someone else and never checking again is the same silence,
-- one step removed.
--
-- The nightly job already knows both halves -- this property is still
-- in breach, this work order is still open -- so the chasing needs no
-- new data, only somewhere to file the result.
--
-- Restraint is the whole design: three days' grace (landscapers work in
-- weekly cycles), then one chase, escalating to critical after a week,
-- and never more often than weekly after that. An alert arriving daily
-- for a fortnight gets filtered, and the real one gets filtered with it.
--
-- Existing types are untouched; this only widens what is allowed.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

alter table public.alerts drop constraint alerts_type_check;

alter table public.alerts add constraint alerts_type_check
  check (type in (
    'violation', 'push_failed', 'lcra_threshold', 'early_warning',
    'variance_expiring', 'work_order_stale'
  ));

alter table public.compliance_events drop constraint compliance_events_type_check;

alter table public.compliance_events add constraint compliance_events_type_check
  check (type in (
    'check', 'violation', 'auto_correction', 'push_failed',
    'stage_confirmed', 'manual_fix_confirmed', 'variance_expiring',
    'work_order_stale'
  ));

-- Driplin reads the alerts themselves to know when it last chased an
-- order, rather than keeping a second bookkeeping column that could
-- drift from what the customer was actually told. That read filters on
-- type and org, so it is worth an index.
create index if not exists alerts_type_org_idx
  on public.alerts (org_id, type, created_at desc);
