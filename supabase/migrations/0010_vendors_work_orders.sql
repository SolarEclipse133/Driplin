-- ============================================================
-- Driplin migration 0010: vendors and work orders
--
-- WHY: a property manager usually isn't the person who walks up to the
-- controller — a landscaping crew is. This lets a manager keep a list
-- of vendors, say which properties each one services, and hand a
-- specific fix to one of them without giving them a Driplin login.
--
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The vendor (landscaper, irrigation contractor).
-- ------------------------------------------------------------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendors_org_idx on public.vendors (org_id, name);

create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

alter table public.vendors enable row level security;

create policy "Members manage their org's vendors"
  on public.vendors for all
  to authenticated
  using (org_id = private.current_org_id())
  with check (org_id = private.current_org_id());

-- ------------------------------------------------------------
-- 2. Which properties a vendor services (many-to-many: one crew
--    usually covers several properties, and a property can have
--    more than one vendor).
-- ------------------------------------------------------------
create table public.vendor_properties (
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (vendor_id, property_id)
);

create index vendor_properties_property_idx
  on public.vendor_properties (property_id);

alter table public.vendor_properties enable row level security;

create policy "Members manage their org's vendor assignments"
  on public.vendor_properties for all
  to authenticated
  using (org_id = private.current_org_id())
  with check (org_id = private.current_org_id());

-- ------------------------------------------------------------
-- 3. A work order: one specific fix, handed to one vendor.
--
--    SECURITY: the vendor opens this from a link containing a random
--    token. We store only a SHA-256 HASH of that token, never the
--    token itself — the same way a password is stored. Anyone reading
--    this table (including a database leak) cannot reconstruct a
--    working link.
--
--    Each token opens exactly one work order, expires, and stops
--    working once the job is marked done. It is not a login: it
--    grants no access to the portfolio, other properties, or any
--    account data.
-- ------------------------------------------------------------
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  controller_id uuid references public.controllers (id) on delete set null,
  vendor_id uuid references public.vendors (id) on delete set null,
  -- sha256 of the link token, hex encoded
  token_hash text not null unique,
  status text not null default 'open'
    check (status in ('open', 'completed', 'cancelled')),
  -- Snapshot of what needed changing when the job was sent, so the
  -- vendor's page keeps showing the original ask even if the rules
  -- are re-evaluated later.
  instructions jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  confirmation_id uuid references public.manual_fix_confirmations (id) on delete set null
);

create index work_orders_org_idx on public.work_orders (org_id, created_at desc);
create index work_orders_property_idx on public.work_orders (property_id, created_at desc);

alter table public.work_orders enable row level security;

create policy "Members manage their org's work orders"
  on public.work_orders for all
  to authenticated
  using (org_id = private.current_org_id())
  with check (org_id = private.current_org_id());
-- No anonymous policy on purpose: the vendor's page reaches this table
-- through a server route that looks rows up BY TOKEN HASH ONLY.
