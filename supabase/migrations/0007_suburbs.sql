-- ============================================================
-- Driplin migration 0007: suburb jurisdictions
--
-- Seeds a drought-stage row for each newly supported city so the
-- admin panel and compliance runner have somewhere to record their
-- confirmed stage. Safe to re-run.
--
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================

insert into public.drought_stage_status (jurisdiction, current_stage)
values
  ('round_rock', 0),
  ('georgetown', 0),
  ('cedar_park', 0),
  ('leander', 0)
on conflict (jurisdiction) do nothing;
