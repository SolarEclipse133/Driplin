-- ============================================================
-- Driplin migration 0002: properties
--
-- Run this in the Supabase dashboard: SQL Editor → New query →
-- paste the whole file → Run. (Same as migration 0001.)
-- ============================================================

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  -- The street NUMBER is stored separately from the street name because
  -- Austin assigns watering days by the LAST DIGIT of the address number
  -- (see lib/rules/address.ts). Digits with an optional trailing letter,
  -- e.g. "1204" or "1204B".
  street_number text not null
    constraint street_number_format check (street_number ~ '^[0-9]+[A-Za-z]?$'),
  street_name text not null,
  city text not null default 'Austin',
  state text not null default 'TX',
  zip text not null
    constraint zip_format check (zip ~ '^[0-9]{5}$'),
  unit_count integer not null
    constraint unit_count_positive check (unit_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_org_id_idx on public.properties (org_id);

-- Keep updated_at current on every change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row-Level Security: members manage only their own org's
-- properties. The database enforces this even if app code has a bug.
-- ------------------------------------------------------------
alter table public.properties enable row level security;

create policy "Members can view their org's properties"
  on public.properties for select
  to authenticated
  using (org_id = private.current_org_id());

create policy "Members can add properties to their org"
  on public.properties for insert
  to authenticated
  with check (org_id = private.current_org_id());

create policy "Members can update their org's properties"
  on public.properties for update
  to authenticated
  using (org_id = private.current_org_id())
  with check (org_id = private.current_org_id());

create policy "Members can delete their org's properties"
  on public.properties for delete
  to authenticated
  using (org_id = private.current_org_id());
