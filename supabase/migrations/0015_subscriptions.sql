-- ============================================================
-- Driplin migration 0015: plans and subscriptions
--
-- WHY: Driplin has no way to say what a company is entitled to, when
-- a trial ends, or when someone has outgrown their plan. Every pilot
-- is tracked in somebody's head.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: stop monitoring. Limits gate
-- ADDING properties. They never pause compliance checks or alerts on
-- properties already being watched. Silently letting an HOA water on
-- the wrong day because a card expired would do real harm to someone
-- who is not a party to the billing dispute, and would be a far worse
-- failure than an unpaid invoice.
--
-- Payment provider columns are present but unused: the first
-- customers are invoiced by hand, and this is where Stripe's ids will
-- land when it is wired up.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations (id) on delete cascade,

  plan text not null default 'pilot'
    check (plan in ('pilot', 'standard', 'portfolio')),

  -- trialing : inside the free pilot window
  -- active   : paying (or comped)
  -- past_due : invoice unpaid; still monitored, cannot add properties
  -- cancelled: ended; still monitored, cannot add properties
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'cancelled')),

  -- How many properties this plan allows. Null means no limit.
  property_limit integer
    constraint property_limit_sane check (property_limit is null or property_limit > 0),

  trial_ends_at timestamptz,
  current_period_end timestamptz,

  -- Filled in when a payment provider is connected. Null while
  -- invoicing by hand.
  provider text check (provider is null or provider in ('stripe')),
  provider_customer_id text,
  provider_subscription_id text,

  -- Free-text, for "comped through March, see email with Karen".
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_status_idx on public.subscriptions (status);

alter table public.subscriptions enable row level security;

-- A company can see its own plan. It cannot change it: that is a
-- commercial decision, not a setting.
create policy "Members view their own subscription"
  on public.subscriptions for select
  to authenticated
  using (org_id = private.current_org_id() or private.is_admin());

create policy "Admins manage subscriptions"
  on public.subscriptions for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ------------------------------------------------------------
-- Every organization gets one, including the ones that already
-- exist. 90 days of pilot, 3 properties.
-- ------------------------------------------------------------
insert into public.subscriptions (org_id, plan, status, property_limit, trial_ends_at)
select id, 'pilot', 'trialing', 3, now() + interval '90 days'
from public.organizations
on conflict (org_id) do nothing;

create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions
    (org_id, plan, status, property_limit, trial_ends_at)
  values
    (new.id, 'pilot', 'trialing', 3, now() + interval '90 days')
  on conflict (org_id) do nothing;
  return new;
end;
$$;

create trigger on_organization_created
  after insert on public.organizations
  for each row execute function public.handle_new_organization();

comment on table public.subscriptions is
  'One row per organization. Limits gate adding properties only — never compliance monitoring of properties already being watched.';
