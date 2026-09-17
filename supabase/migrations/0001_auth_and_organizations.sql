-- ============================================================
-- Driplin migration 0001: organizations, profiles, auth wiring
--
-- Run this in the Supabase dashboard: SQL Editor → New query →
-- paste the whole file → Run. (See SETUP.md, step 3.)
-- ============================================================

-- One row per customer: a property management company or HOA.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- One row per user account, linked 1-to-1 with Supabase's built-in
-- auth.users table (which stores emails/passwords for us).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null default '',
  phone text,
  -- 'manager' = normal customer user; 'admin' = Driplin ops (sees the
  -- drought-stage confirmation panel). Roles are only ever assigned
  -- server-side; there is deliberately no policy letting users change it.
  role text not null default 'manager' check (role in ('manager', 'admin')),
  created_at timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles (org_id);

-- ------------------------------------------------------------
-- Helper: which organization does the currently logged-in user
-- belong to? SECURITY DEFINER so it can read profiles without
-- tripping over the row-level security policies below (which
-- would otherwise recurse).
-- ------------------------------------------------------------
create schema if not exists private;

create or replace function private.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.profiles where id = auth.uid()
$$;

-- Lock the helper down: only the database itself and logged-in users
-- may call it.
revoke all on function private.current_org_id() from public;
grant execute on function private.current_org_id() to authenticated;

-- ------------------------------------------------------------
-- Row-Level Security: the database itself guarantees that users
-- can only see rows belonging to their own organization.
-- ------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;

create policy "Members can view their own organization"
  on public.organizations for select
  to authenticated
  using (id = private.current_org_id());

create policy "Members can view profiles in their organization"
  on public.profiles for select
  to authenticated
  using (org_id = private.current_org_id());

-- Note: there are intentionally NO insert/update/delete policies yet.
-- Organization and profile rows are created by the trigger below
-- (which runs with elevated rights), and nothing else may modify them.
-- Policies get added when features need them.

-- ------------------------------------------------------------
-- When someone signs up, automatically create their organization
-- and profile. The signup form passes full_name and company_name
-- in the user metadata.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
begin
  insert into public.organizations (name)
  values (
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
      'My Company'
    )
  )
  returning id into new_org_id;

  insert into public.profiles (id, org_id, full_name)
  values (
    new.id,
    new_org_id,
    coalesce(trim(new.raw_user_meta_data ->> 'full_name'), '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
