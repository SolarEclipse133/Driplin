-- ============================================================
-- Driplin migration 0004: rules engine
--   drought_stage_status (single row), compliance_events, alerts,
--   admin helper, controller compliance columns
--
-- Run in Supabase: SQL Editor → New query → paste → Run.
--
-- Design note: the WateringRules themselves (digit → day table,
-- per-stage time windows) are deliberately a hardcoded, documented
-- config in lib/rules/watering-config.ts, per the product spec — they
-- change on the order of years. Every compliance event embeds a
-- snapshot of the rules used, so the log stays auditable.
-- ============================================================

-- Helper: is the current user a Driplin admin?
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

-- ------------------------------------------------------------
-- The single row holding the currently confirmed drought stage.
-- stage numbering: 0 = Conservation, 1–4 = Stage 1–4.
-- The nightly LCRA job only ever touches raw_lcra_*; the stage
-- fields change only through an admin's explicit confirmation.
-- ------------------------------------------------------------
create table public.drought_stage_status (
  -- always-true primary key guarantees this table has exactly one row
  singleton boolean primary key default true check (singleton),
  current_stage integer not null default 0 check (current_stage between 0 and 4),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  source_link text,
  raw_lcra_reading numeric,          -- combined storage, acre-feet
  raw_lcra_percent text,             -- e.g. "93%" as reported
  raw_lcra_read_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger drought_stage_status_set_updated_at
  before update on public.drought_stage_status
  for each row execute function public.set_updated_at();

insert into public.drought_stage_status (singleton) values (true);

alter table public.drought_stage_status enable row level security;

-- Everyone signed in can read it (it powers the "verified as of" label).
create policy "All members can view drought stage status"
  on public.drought_stage_status for select
  to authenticated
  using (true);

-- Only admins can change it (the nightly cron uses the service role,
-- which bypasses row-level security).
create policy "Admins can update drought stage status"
  on public.drought_stage_status for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ------------------------------------------------------------
-- Append-only log of every check, violation, correction, failed
-- push, and stage confirmation. org_id null = system-wide event.
-- ------------------------------------------------------------
create table public.compliance_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  controller_id uuid references public.controllers (id) on delete set null,
  type text not null check (type in
    ('check', 'violation', 'auto_correction', 'push_failed', 'stage_confirmed')),
  summary text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index compliance_events_org_idx on public.compliance_events (org_id, created_at desc);
create index compliance_events_property_idx on public.compliance_events (property_id, created_at desc);

alter table public.compliance_events enable row level security;

create policy "Members view their org's events and system events"
  on public.compliance_events for select
  to authenticated
  using (org_id = private.current_org_id() or org_id is null);

create policy "Members insert events for their org"
  on public.compliance_events for insert
  to authenticated
  with check (
    org_id = private.current_org_id()
    or (org_id is null and private.is_admin())
  );

-- ------------------------------------------------------------
-- Alerts humans need to see. org_id null = internal admin alert
-- (e.g. the LCRA threshold crossing that needs stage confirmation).
-- ------------------------------------------------------------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  type text not null check (type in ('violation', 'push_failed', 'lcra_threshold')),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  message text not null,
  details jsonb,
  acknowledged boolean not null default false,
  acknowledged_by uuid references public.profiles (id),
  sms_sent boolean not null default false,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index alerts_org_idx on public.alerts (org_id, created_at desc);
create index alerts_open_idx on public.alerts (acknowledged, created_at desc);

alter table public.alerts enable row level security;

create policy "Members view their org's alerts; admins also internal ones"
  on public.alerts for select
  to authenticated
  using (
    org_id = private.current_org_id()
    or (org_id is null and private.is_admin())
  );

create policy "Members insert alerts for their org; admins internal ones"
  on public.alerts for insert
  to authenticated
  with check (
    org_id = private.current_org_id()
    or (org_id is null and private.is_admin())
  );

create policy "Members acknowledge their org's alerts; admins internal ones"
  on public.alerts for update
  to authenticated
  using (
    org_id = private.current_org_id()
    or (org_id is null and private.is_admin())
  )
  with check (
    org_id = private.current_org_id()
    or (org_id is null and private.is_admin())
  );

-- ------------------------------------------------------------
-- Per-controller compliance state, refreshed by every check run.
-- needs_manual_fix = out of compliance AND the vendor API can't be
-- written to, so the manager must change the schedule by hand.
-- ------------------------------------------------------------
alter table public.controllers
  add column compliance_status text not null default 'unknown'
    check (compliance_status in ('unknown', 'compliant', 'violation', 'needs_manual_fix')),
  add column compliance_detail jsonb,
  add column compliance_checked_at timestamptz;
