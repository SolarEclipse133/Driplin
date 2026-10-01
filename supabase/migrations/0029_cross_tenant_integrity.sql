-- ============================================================
-- Driplin migration 0029: SECURITY — a row cannot reference another
-- organization's property or controller
--
-- THE HOLE: row-level security checked that a new row's OWN org_id was
-- the caller's. It never checked that the property_id beside it belonged
-- to that same organization. Five actions inserted a request-supplied
-- property_id with no ownership check -- adding a variance, creating a
-- board link, and attaching a demo, vendor or manual controller -- so any
-- signed-in user could write a row of their own that pointed at somebody
-- else's property, and RLS allowed it.
--
-- WHAT THAT GAVE AN ATTACKER, concretely:
--
--   * A fake watering variance on a victim's property. The nightly job
--     reads property_variances with the SERVICE ROLE, filtered on
--     property_id alone, so the forged approval was applied: the victim's
--     violations stopped being flagged, Driplin reported the property
--     compliant while it watered on prohibited days, and auto-correction
--     was suppressed. In a drought-compliance product that is a fine the
--     customer was paying Driplin to prevent.
--
--   * A working public board link to a victim's property, exposing its
--     name, full address, managing company, compliance status and recent
--     activity to anyone the attacker sent the URL to.
--
-- Unguessable UUIDs limited reach, but an id is not an authorization
-- boundary: ids leak, through reports, support threads and URLs.
--
-- THE FIX, at the layer that cannot be forgotten. Each child row's
-- (property_id, org_id) pair must now exist together on the property
-- itself, enforced by a composite foreign key. The application also
-- checks ownership and returns a clear error, and the service-role reads
-- are scoped by organization -- but this is the control that makes the
-- whole class of bug impossible rather than merely absent today.
--
-- Postgres MATCH SIMPLE skips a composite foreign key when any column is
-- null, which is exactly right for the system-wide rows in
-- compliance_events and alerts that carry no organization.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- Wrapped in a transaction: fourteen constraint changes that half-applied
-- would leave some tables guarded and others not, which is worse than
-- either state. If any statement fails, nothing changes and the error
-- names the constraint.
--
-- It will also fail, loudly and harmlessly, if any row already violates
-- the new rule -- i.e. if somebody has already exploited this. That is
-- the intended behaviour: those rows need looking at, not cascading away.
-- ============================================================

begin;

-- A composite foreign key needs a matching unique key to point at.
alter table public.properties
  add constraint properties_id_org_key unique (id, org_id);

alter table public.controllers
  add constraint controllers_id_org_key unique (id, org_id);

-- ------------------------------------------------------------
-- Properties: every table that names one must agree on the owner.
-- ------------------------------------------------------------
alter table public.property_variances
  drop constraint if exists property_variances_property_id_fkey,
  add constraint property_variances_property_org_fkey
    foreign key (property_id, org_id)
    references public.properties (id, org_id) on delete cascade;

alter table public.board_links
  drop constraint if exists board_links_property_id_fkey,
  add constraint board_links_property_org_fkey
    foreign key (property_id, org_id)
    references public.properties (id, org_id) on delete cascade;

alter table public.controllers
  drop constraint if exists controllers_property_id_fkey,
  add constraint controllers_property_org_fkey
    foreign key (property_id, org_id)
    references public.properties (id, org_id) on delete cascade;

alter table public.work_orders
  drop constraint if exists work_orders_property_id_fkey,
  add constraint work_orders_property_org_fkey
    foreign key (property_id, org_id)
    references public.properties (id, org_id) on delete cascade;

alter table public.manual_fix_confirmations
  drop constraint if exists manual_fix_confirmations_property_id_fkey,
  add constraint manual_fix_confirmations_property_org_fkey
    foreign key (property_id, org_id)
    references public.properties (id, org_id) on delete cascade;

alter table public.vendor_properties
  drop constraint if exists vendor_properties_property_id_fkey,
  add constraint vendor_properties_property_org_fkey
    foreign key (property_id, org_id)
    references public.properties (id, org_id) on delete cascade;

-- compliance_events and alerts allow a null org_id for system-wide rows.
-- MATCH SIMPLE leaves those unchecked and constrains the rest.
alter table public.compliance_events
  drop constraint if exists compliance_events_property_id_fkey,
  add constraint compliance_events_property_org_fkey
    foreign key (property_id, org_id)
    references public.properties (id, org_id) on delete cascade;

alter table public.alerts
  drop constraint if exists alerts_property_id_fkey,
  add constraint alerts_property_org_fkey
    foreign key (property_id, org_id)
    references public.properties (id, org_id) on delete cascade;

-- ------------------------------------------------------------
-- Controllers: same again for the rows that name one.
-- ------------------------------------------------------------
alter table public.cached_schedules
  drop constraint if exists cached_schedules_controller_id_fkey,
  add constraint cached_schedules_controller_org_fkey
    foreign key (controller_id, org_id)
    references public.controllers (id, org_id) on delete cascade;

-- A work order's controller matters most of all: /fix/[token] resolves it
-- with the service role and then re-checks and may rewrite that
-- controller. These three columns are nullable, so MATCH SIMPLE leaves a
-- null one alone and constrains the rest.
alter table public.work_orders
  drop constraint if exists work_orders_controller_id_fkey,
  add constraint work_orders_controller_org_fkey
    foreign key (controller_id, org_id)
    references public.controllers (id, org_id) on delete set null;

alter table public.manual_fix_confirmations
  drop constraint if exists manual_fix_confirmations_controller_id_fkey,
  add constraint manual_fix_confirmations_controller_org_fkey
    foreign key (controller_id, org_id)
    references public.controllers (id, org_id) on delete set null;

alter table public.compliance_events
  drop constraint if exists compliance_events_controller_id_fkey,
  add constraint compliance_events_controller_org_fkey
    foreign key (controller_id, org_id)
    references public.controllers (id, org_id) on delete set null;

comment on constraint properties_id_org_key on public.properties is
  'Exists so child tables can point a composite foreign key at (id, org_id), which is what stops a row referencing another organization''s property.';

commit;
