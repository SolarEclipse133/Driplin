-- ============================================================
-- Driplin migration 0003: controllers, vendor credentials,
-- cached schedules
--
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================

-- One row per organization per vendor: the API key the org uses to
-- talk to that vendor. MVP note: the key is protected by row-level
-- security (only members of the org can read it) and by Supabase's
-- encryption at rest; column-level encryption can be added later
-- without changing the app code that reads it.
create table public.vendor_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  vendor text not null check (vendor in ('rachio', 'hydrawise')),
  api_key text not null,
  created_at timestamptz not null default now(),
  unique (org_id, vendor)
);

alter table public.vendor_credentials enable row level security;

create policy "Members manage their org's vendor credentials"
  on public.vendor_credentials for all
  to authenticated
  using (org_id = private.current_org_id())
  with check (org_id = private.current_org_id());

-- A physical (or demo) irrigation controller attached to a property.
create table public.controllers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  vendor text not null check (vendor in ('rachio', 'hydrawise', 'demo')),
  -- The device's ID in the vendor's system ('demo' devices use a random UUID).
  vendor_device_id text not null,
  name text not null,
  status text not null default 'connected'
    check (status in ('connected', 'error', 'disconnected')),
  last_seen_at timestamptz,
  -- Simulated device state for vendor = 'demo': the demo controller
  -- stores its "current schedule" here so schedule corrections can be
  -- exercised end to end without physical hardware.
  demo_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, vendor, vendor_device_id)
);

create index controllers_org_id_idx on public.controllers (org_id);
create index controllers_property_id_idx on public.controllers (property_id);

create trigger controllers_set_updated_at
  before update on public.controllers
  for each row execute function public.set_updated_at();

alter table public.controllers enable row level security;

create policy "Members manage their org's controllers"
  on public.controllers for all
  to authenticated
  using (org_id = private.current_org_id())
  with check (org_id = private.current_org_id());

-- Our own copy of each controller's last-known schedule, so the
-- dashboard keeps working when a vendor API is slow or down.
create table public.cached_schedules (
  controller_id uuid primary key references public.controllers (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Normalized schedule: { programs: [{ vendorProgramId, name, enabled,
  -- days: ["MON",...], startTime: "HH:MM", durationMinutes }] }
  schedule jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.cached_schedules enable row level security;

create policy "Members manage their org's cached schedules"
  on public.cached_schedules for all
  to authenticated
  using (org_id = private.current_org_id())
  with check (org_id = private.current_org_id());
