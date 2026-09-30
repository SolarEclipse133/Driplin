-- ============================================================
-- Driplin migration 0026: keep the history of what was claimed
--
-- WHY: a manual controller's schedule is somebody's word -- Driplin
-- cannot read the hardware, so the stored schedule is whatever a person
-- last said it was set to. Until now that word could only be given once,
-- when the controller was added. A typo was permanent: Driplin would
-- judge the wrong schedule forever, send a landscaper after a problem
-- that did not exist, and file the result as evidence.
--
-- Letting it be corrected creates a second problem, though. If the
-- claim can be quietly replaced, the record is weaker than it looks --
-- and "prove this property watered legally last August" needs what was
-- claimed IN August, not just the latest version of the story.
--
-- So every entry and every correction is logged as its own event, with
-- what it was before, what it is now, and who said so.
--
-- Existing types are untouched; this only widens what is allowed.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

alter table public.compliance_events drop constraint compliance_events_type_check;

alter table public.compliance_events add constraint compliance_events_type_check
  check (type in (
    'check', 'violation', 'auto_correction', 'push_failed',
    'stage_confirmed', 'manual_fix_confirmed', 'variance_expiring',
    'work_order_stale', 'schedule_entered'
  ));
