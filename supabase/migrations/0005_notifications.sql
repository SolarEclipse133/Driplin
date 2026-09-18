-- ============================================================
-- Driplin migration 0005: notifications
--   profiles.email + self-service profile updates, notification_log
--
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================

-- Store the email on the profile so alert dispatch (which runs under
-- row-level security) can address members without touching auth.users.
alter table public.profiles add column email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id;

-- Keep it filled for future sign-ups.
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

  insert into public.profiles (id, org_id, full_name, email)
  values (
    new.id,
    new_org_id,
    coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    new.email
  );

  return new;
end;
$$;

-- Members may now edit their own profile (name, phone)…
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- …but never their role or organization. This trigger blocks privilege
-- escalation even though the update policy above allows the row write.
create or replace function public.prevent_privilege_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (new.role is distinct from old.role
          or new.org_id is distinct from old.org_id) then
    raise exception 'role and organization cannot be changed here';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_privilege_change
  before update on public.profiles
  for each row execute function public.prevent_privilege_change();

-- ------------------------------------------------------------
-- Every notification we send (or, without API keys configured,
-- WOULD have sent — status 'logged') is recorded here for audit
-- and for verifying content before the senders go live.
-- ------------------------------------------------------------
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid references public.alerts (id) on delete set null,
  org_id uuid references public.organizations (id) on delete cascade,
  channel text not null check (channel in ('sms', 'email')),
  recipient text not null,
  subject text,
  body text not null,
  -- 'logged' = log-only mode (no API keys configured); 'sent' = the
  -- provider accepted it; 'failed' = the provider rejected it.
  status text not null check (status in ('logged', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index notification_log_org_idx on public.notification_log (org_id, created_at desc);

alter table public.notification_log enable row level security;

create policy "Members view their org's notifications; admins internal ones"
  on public.notification_log for select
  to authenticated
  using (
    org_id = private.current_org_id()
    or (org_id is null and private.is_admin())
  );

create policy "Members insert notifications for their org; admins internal"
  on public.notification_log for insert
  to authenticated
  with check (
    org_id = private.current_org_id()
    or (org_id is null and private.is_admin())
  );
