-- ============================================================
-- Driplin migration 0027: say when a controller cannot be read
--
-- WHY: when a sync failed, Driplin kept the cached schedule and judged
-- that instead. The reasoning was sound -- one flaky request should not
-- blank a dashboard -- and it quietly stopped being sound after a day.
--
-- A customer rotates their vendor API key, revokes Driplin's access, or
-- a controller drops off the network. Every sync fails from then on. The
-- cache freezes at whatever it last said, and if that was compliant,
-- Driplin reported COMPLIANT indefinitely, from a copy that could be
-- months old, about hardware it could no longer see. The connection
-- status was set to 'error' and shown in no screen; the dashboard rollup
-- read only compliance_status; and the cache's own fetched_at was never
-- compared to the clock anywhere in the codebase.
--
-- That is the failure this product is sold to prevent, and worse than
-- silence, because the dashboard actively reassured.
--
-- Now a cached schedule has a shelf life of three nights -- long enough
-- for a transient outage to recover on its own, short enough that nobody
-- waters illegally for a week behind a green badge. Past it Driplin makes
-- no claim, says so in plain words, and tells the customer, because a
-- rotated key or a revoked authorisation is theirs to fix.
--
-- Existing types are untouched; this only widens what is allowed.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

alter table public.alerts drop constraint alerts_type_check;

alter table public.alerts add constraint alerts_type_check
  check (type in (
    'violation', 'push_failed', 'lcra_threshold', 'early_warning',
    'variance_expiring', 'work_order_stale', 'controller_unreadable'
  ));

alter table public.compliance_events drop constraint compliance_events_type_check;

alter table public.compliance_events add constraint compliance_events_type_check
  check (type in (
    'check', 'violation', 'auto_correction', 'push_failed',
    'stage_confirmed', 'manual_fix_confirmed', 'variance_expiring',
    'work_order_stale', 'schedule_entered', 'controller_unreadable'
  ));
