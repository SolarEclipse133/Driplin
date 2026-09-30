-- ============================================================
-- Driplin migration 0024: archive a property, don't destroy its record
--
-- WHY: deleting a property cascaded away everything Driplin had ever
-- recorded about it --
--
--   compliance_events        on delete cascade
--   manual_fix_confirmations on delete cascade   <- the photo proof
--   work_orders              on delete cascade
--
-- -- with no undo and nothing to restore from. The UI warned, so this
-- was a deliberate choice rather than an oversight, but it is the wrong
-- one for a compliance tool.
--
-- The compliance record IS the product. A manager who loses a property
-- from their portfolio still needs last August's evidence when the city
-- or an HOA board asks -- and that is exactly the moment they no longer
-- have the property. Driplin should not be able to destroy the proof it
-- exists to produce.
--
-- So removing a property now archives it: gone from the dashboard, not
-- monitored, not billed, record intact. A real purge stays possible for
-- a genuinely mistaken entry or a customer's erasure request, but only
-- as a separate deliberate act on an already-archived property.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

alter table public.properties
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null,
  add column archive_reason text;

-- Every list, count and nightly sweep filters on this, so it is worth
-- an index: partial, because the live properties are what get read.
create index properties_live_idx
  on public.properties (org_id)
  where archived_at is null;

comment on column public.properties.archived_at is
  'Set when a property leaves the portfolio. Archived properties are hidden from lists, excluded from monitoring and from the billed count, and keep their full compliance history.';

comment on column public.properties.archive_reason is
  'Why it was archived -- contract ended, entered by mistake, sold. Shown in the archive so a rejoining property can be restored knowingly.';
