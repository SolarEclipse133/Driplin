-- ============================================================
-- Driplin migration 0017: controllers Driplin cannot connect to
--
-- WHY: a great deal of HOA common-area irrigation runs on old
-- commercial hardware — Rain Bird ESP, Hunter ICC, Toro — boxes on a
-- wall with a dial and no network. Until now Driplin had nothing to
-- say about those properties: no controller meant no rules, no tasks,
-- no reports. That excluded what may be most of the market.
--
-- A manual controller is a real controller whose schedule a person
-- types in and whose schedule Driplin cannot write. It reuses
-- everything already built for that case: rule evaluation, manual-fix
-- instructions, vendor work orders, photo proof, response-time
-- benchmarking and board reports.
--
-- WHAT DRIPLIN WILL NOT DO with one: claim to have verified it.
-- It cannot read the hardware, so a confirmation is recorded as
-- somebody's word, never as a checked fact.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

alter table public.controllers drop constraint controllers_vendor_check;

alter table public.controllers add constraint controllers_vendor_check
  check (vendor in ('rachio', 'hydrawise', 'demo', 'manual'));

-- What the person told us this controller is set to. Same shape as the
-- schedules Driplin reads from a vendor API, so the rules engine does
-- not know or care which it is looking at.
alter table public.controllers
  add column entered_schedule jsonb;

-- When they last told us. Shown next to the schedule, because a
-- hand-entered schedule is only as current as its last update and the
-- interface should not pretend otherwise.
alter table public.controllers
  add column entered_schedule_at timestamptz;

comment on column public.controllers.entered_schedule is
  'For vendor = manual: the watering programs a person entered, since Driplin cannot read this hardware.';
