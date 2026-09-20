-- ============================================================
-- Driplin migration 0011: photo proof on manual fixes
--
-- WHY: "I changed it" is a claim. Driplin already re-reads the
-- controller to check the schedule, but a photo of the controller
-- screen is what an HOA board actually wants to see in a report.
--
-- Photos are OPTIONAL everywhere. Requiring one would make people
-- skip confirming altogether, which would cost more than the photo
-- is worth.
--
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================

-- What format the photo is in, so the report knows whether it can
-- embed it. Path already exists from migration 0009.
alter table public.manual_fix_confirmations add column photo_mime text;

-- ------------------------------------------------------------
-- A PRIVATE storage bucket. Not public: these are photos of
-- customers' equipment, and a public bucket would make every one of
-- them readable by anyone who guessed a filename. Access happens
-- through short-lived signed links generated server-side.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fix-photos', 'fix-photos', false)
on conflict (id) do nothing;

-- Files are stored as <org_id>/<file>.  The policies below read that
-- first path segment, so one company can never reach another's photos
-- even with a valid login.
create policy "Members read their org's fix photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'fix-photos'
    and (storage.foldername(name))[1] = private.current_org_id()::text
  );

create policy "Members upload fix photos to their own org folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'fix-photos'
    and (storage.foldername(name))[1] = private.current_org_id()::text
  );

-- Vendors have no login, so their uploads go through the server using
-- the service role, which bypasses these policies. That path is still
-- constrained: the server derives the org folder from the work order
-- the token resolved to, never from anything the vendor sends.
