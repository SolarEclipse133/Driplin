-- ============================================================
-- Driplin migration 0016: let admins see organization names
--
-- WHY: the plan management added in 0015 lets an admin change any
-- company's plan, but the organizations table is readable only by
-- members of that organization — so the admin screen listed every
-- company as "(unnamed)". Changing the plan of an anonymous row is
-- exactly the kind of interface that produces a mistake.
--
-- SCOPE OF THE WIDENING, stated plainly: admins can already read and
-- change every subscription row, and read system-wide compliance
-- events. This adds the company NAME to what they can see, which is
-- strictly less sensitive than what they could already do. It grants
-- no access to any organization's properties, controllers,
-- credentials, photos or compliance records — those policies are
-- untouched and still scope to membership.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

drop policy "Members can view their own organization" on public.organizations;

create policy "Members view their own organization; admins view all"
  on public.organizations for select
  to authenticated
  using (id = private.current_org_id() or private.is_admin());
