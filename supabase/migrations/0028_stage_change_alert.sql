-- ============================================================
-- Driplin migration 0028: a stage change is something customers hear
--
-- WHY: confirming a drought stage logged an internal event with
-- org_id null, acknowledged Driplin's own threshold alerts, and re-ran
-- compliance for the confirming admin's organization only. Its own
-- success message said the rest: "Other orgs update on the nightly run."
--
-- So the single highest-stakes event in the domain -- a city changing the
-- legal watering days for every property in it at once -- reached
-- customers indirectly and up to a day late, as a scatter of individual
-- violation alerts with nothing anywhere explaining why everything went
-- red on the same night.
--
-- Now every organization with property in that city is re-checked on
-- confirmation, and each gets ONE message naming the cause, what Driplin
-- already corrected, and what still needs a person. One message rather
-- than one per controller: forty alerts from a single cause is how people
-- learn to filter Driplin's mail, and then miss the one that matters.
--
-- Existing types are untouched; this only widens what is allowed.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

alter table public.alerts drop constraint alerts_type_check;

alter table public.alerts add constraint alerts_type_check
  check (type in (
    'violation', 'push_failed', 'lcra_threshold', 'early_warning',
    'variance_expiring', 'work_order_stale', 'controller_unreadable',
    'stage_change'
  ));
