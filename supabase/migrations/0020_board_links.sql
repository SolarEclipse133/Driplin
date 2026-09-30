-- ============================================================
-- Driplin migration 0020: read-only links for HOA boards
--
-- WHY: the board is who all of this is ultimately for — they are the
-- ones who see the fine, and the ones the manager has to answer to —
-- and they have no way to see any of it. The manager forwards a PDF
-- once a quarter and that is the whole relationship.
--
-- A board link is a URL that shows ONE property's compliance status
-- and nothing else. No login, no account, no portfolio, no other
-- properties. It is the same mechanism as the vendor work-order link:
-- the URL is the credential, so only its hash is stored.
--
-- Unlike a work order it is long-lived, because a board wants a
-- standing link. It is therefore revocable, and expires after a year
-- so a link pasted into meeting minutes in 2026 is not still live in
-- 2031.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

create table public.board_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,

  -- sha256 of the link token, hex encoded. The raw token is never here.
  token_hash text not null unique,

  -- What the manager called it: "Oak Ridge HOA board".
  label text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  -- So a manager can see whether anyone actually opens it.
  last_viewed_at timestamptz
);

create index board_links_property_idx on public.board_links (property_id);

alter table public.board_links enable row level security;

-- Members manage links for their own org's properties. Anonymous
-- visitors never query this table directly: the public page looks a
-- link up by token hash through the service role, exactly as the
-- vendor page does.
create policy "Members manage their org's board links"
  on public.board_links for all
  to authenticated
  using (org_id = private.current_org_id())
  with check (org_id = private.current_org_id());

comment on table public.board_links is
  'No-login read-only links to one property''s compliance status. The URL is the credential; only its hash is stored.';
