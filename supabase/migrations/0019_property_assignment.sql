-- ============================================================
-- Driplin migration 0019: assign a property to a manager
--
-- WHY: every member of a company currently receives every alert. At
-- forty properties that is noise, and noisy alerts get muted — which
-- silently destroys the entire value of the product. The alert that
-- matters arrives in a folder nobody reads.
--
-- Assigning a property routes its alerts to the person responsible
-- for it. Unassigned properties still go to everyone, so nothing gets
-- quieter by accident.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

alter table public.properties
  add column assigned_to uuid references public.profiles (id) on delete set null;

create index properties_assigned_to_idx on public.properties (assigned_to);

comment on column public.properties.assigned_to is
  'Manager responsible for this property. Alerts route to them; null means everyone. Never results in nobody being told.';
