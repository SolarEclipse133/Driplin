-- ============================================================
-- Driplin migration 0009: manual-fix confirmations
--
-- WHY: when a controller can't be corrected remotely, Driplin prints
-- instructions but has no way to record that someone actually did the
-- work. This adds that record — who, when, and whether the schedule
-- checked out afterwards. It is the foundation for vendor work orders
-- (routing the task out), photo proof, and the lateness ranking.
--
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Allow the new event type in the audit log.
--    Existing types are untouched; this only widens what's allowed.
-- ------------------------------------------------------------
alter table public.compliance_events drop constraint compliance_events_type_check;

alter table public.compliance_events add constraint compliance_events_type_check
  check (type in (
    'check', 'violation', 'auto_correction', 'push_failed',
    'stage_confirmed', 'manual_fix_confirmed'
  ));

-- ------------------------------------------------------------
-- 2. One row per "somebody says they fixed it" event.
--
--    confirmed_by is null for work done by an outside vendor, who has
--    no Driplin login — confirmed_by_name always carries a readable
--    name either way, so the log never has an anonymous entry.
--
--    flagged_at records when the property was first flagged, so the
--    gap between "we asked" and "it was done" is measurable later.
--
--    verified records what Driplin found when it re-read the
--    controller right after the confirmation: true = the schedule now
--    matches the rules, false = it still doesn't, null = we couldn't
--    reach the controller to check. A claim is not proof.
-- ------------------------------------------------------------
create table public.manual_fix_confirmations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  controller_id uuid references public.controllers (id) on delete set null,
  compliance_event_id uuid references public.compliance_events (id) on delete set null,
  confirmed_by uuid references public.profiles (id),
  confirmed_by_name text not null,
  confirmed_via text not null check (confirmed_via in ('manager', 'vendor')),
  note text,
  -- Filled in by the photo-proof feature; kept nullable so confirming
  -- never requires a photo.
  photo_path text,
  flagged_at timestamptz,
  verified boolean,
  created_at timestamptz not null default now()
);

create index manual_fix_confirmations_org_idx
  on public.manual_fix_confirmations (org_id, created_at desc);
create index manual_fix_confirmations_property_idx
  on public.manual_fix_confirmations (property_id, created_at desc);

alter table public.manual_fix_confirmations enable row level security;

create policy "Members view their org's manual fix confirmations"
  on public.manual_fix_confirmations for select
  to authenticated
  using (org_id = private.current_org_id());

create policy "Members record manual fix confirmations for their org"
  on public.manual_fix_confirmations for insert
  to authenticated
  with check (org_id = private.current_org_id());
