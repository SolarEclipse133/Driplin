-- ============================================================
-- Driplin migration 0021: more than one person per company
--
-- WHY: signup created a brand-new organization for every account, so
-- there was no way to add a colleague. A management company with eight
-- staff could not use Driplin as a company — and the per-property
-- alert routing added in 0019 could never route, because an
-- organization never had a second person to route to.
--
-- SECURITY NOTE ON THE DESIGN: the org a new account joins CANNOT be
-- chosen by the client. If signup could pass an org_id, anyone could
-- join any company by guessing one. So the invitation token is
-- verified inside the trigger, against a hash, and the org comes from
-- the matched invitation. The client supplies only a secret it had to
-- have been given.
--
-- The invitation is also bound to the email address it was sent to, so
-- a forwarded or intercepted link cannot be redeemed by someone else.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

-- Needed to hash the token inside the trigger. Supabase ships this.
create extension if not exists pgcrypto with schema extensions;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,

  -- Who it was sent to. Redemption requires the new account to use
  -- this address, so a forwarded link is useless to anyone else.
  email text not null,

  -- sha256 of the invite token, hex. The raw token is never stored,
  -- exactly as with vendor work-order links.
  token_hash text not null unique,

  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index invitations_org_idx on public.invitations (org_id, created_at desc);

alter table public.invitations enable row level security;

-- Members see and manage invitations for their own company. Nobody
-- reads this table anonymously: redemption happens inside the trigger.
create policy "Members manage their org's invitations"
  on public.invitations for all
  to authenticated
  using (org_id = private.current_org_id())
  with check (org_id = private.current_org_id());

-- ------------------------------------------------------------
-- Signup: join the inviting company, or start a new one.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  invite_token text;
  invite record;
begin
  invite_token := nullif(trim(new.raw_user_meta_data ->> 'invitation_token'), '');

  if invite_token is not null then
    -- Match on the HASH. An unknown, expired, revoked or already-used
    -- token simply finds nothing, and the account falls through to
    -- getting its own organization rather than failing signup.
    select * into invite
    from public.invitations
    where token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex')
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
      -- Bound to the address it was sent to.
      and lower(email) = lower(new.email)
    limit 1;

    if found then
      new_org_id := invite.org_id;
      update public.invitations
        set accepted_at = now()
        where id = invite.id;
    end if;
  end if;

  if new_org_id is null then
    insert into public.organizations (name)
    values (
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
        'My Company'
      )
    )
    returning id into new_org_id;
  end if;

  -- Always 'manager'. The 'admin' role is Driplin's own operations
  -- access and must never be reachable through an invitation.
  insert into public.profiles (id, org_id, full_name, role)
  values (
    new.id,
    new_org_id,
    coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    'manager'
  );

  return new;
end;
$$;

comment on table public.invitations is
  'Pending invitations to join a company. The URL is the credential; only its hash is stored, and redemption is bound to the invited email address.';
