-- ============================================================
-- Driplin migration 0023: approved variances
--
-- WHY: cities grant variances from the watering schedule, and Driplin
-- had no concept of one. Austin Water alone offers three kinds --
-- New Xeriscape Landscape, LARGE PROPERTY ("residential or commercial
-- property that cannot be fully watered under the current schedule")
-- and Environmental -- granted case by case through its Conservation
-- Hub.
--
-- That middle one is aimed squarely at Driplin's customers. An HOA
-- common area that cannot be covered inside a single morning window
-- gets a variance with its own schedule. Until now Driplin flagged
-- such a property non-compliant every single night while it watered
-- entirely legally. A manager cannot clear that, cannot explain it to
-- a board, and learns that Driplin's red badges mean nothing -- which
-- spends the only asset this product has, and trains exactly the habit
-- that makes the real alert get ignored later.
--
-- WHAT DRIPLIN DOES NOT DO: derive the schedule. These are approved
-- case by case, so the permitted days and hours are whatever the
-- utility wrote on THAT property's letter. Austin does publish one
-- variance schedule -- daily for 10 days, every other day through 20,
-- every third day through 30 -- but only for landscape installed to
-- obtain a certificate of occupancy on a newly built single-family
-- home, which is not who Driplin serves. Encoding it as "the" variance
-- rule would repeat the Austin and Leander bug: a plausible table
-- applied to accounts it was never written for.
--
-- So the schedule is entered from the approval document, and Driplin
-- is explicit that the utility approved it and the CUSTOMER reported
-- it. Driplin never pushes a widened schedule to hardware on that
-- basis. What Driplin adds is what people actually get wrong:
-- remembering the expiry, and noticing when the drought stage has
-- moved past the one it was granted under.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

create table public.property_variances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,

  kind text not null default 'other'
    check (kind in ('new_landscape', 'large_property', 'environmental', 'other')),

  -- The utility's own approval number. Required and non-blank: a
  -- variance nobody at the utility can look up is not evidence of
  -- anything, and the rules engine ignores one without it.
  reference text not null check (length(trim(reference)) > 0),

  approved_on date not null,
  -- Required. A variance with no end date is an excuse, not a variance.
  expires_on date not null,
  check (expires_on >= approved_on),

  -- The drought stage in force when the utility approved it. Austin
  -- narrows which variances stay valid as stages tighten, so a stage
  -- change is a reason to re-check with the utility.
  approved_at_stage smallint not null default 0
    check (approved_at_stage between 0 and 4),

  -- Days the approval permits, as weekday codes. NULL means every day.
  allowed_days text[],
  -- Hours it permits: [{"start":"00:00","end":"10:00"}]. An empty array
  -- means the approval stated no time limit -- recorded, not assumed.
  allowed_windows jsonb not null default '[]'::jsonb,

  notes text,

  -- Who entered it. If an approval turns out not to say what was
  -- typed, the record shows whose assertion Driplin relied on.
  created_by uuid references public.profiles (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index property_variances_property_idx
  on public.property_variances (property_id, expires_on desc);

alter table public.property_variances enable row level security;

create policy "Members manage their org's variances"
  on public.property_variances for all
  to authenticated
  using (org_id = private.current_org_id() or private.is_admin())
  with check (org_id = private.current_org_id() or private.is_admin());

comment on table public.property_variances is
  'An approval the utility granted and the customer reported. Driplin judges against it but never pushes a widened schedule on its basis, and never treats it as verified.';

comment on column public.property_variances.allowed_days is
  'Weekday codes the approval permits (MON..SUN). NULL means any day.';

-- ------------------------------------------------------------
-- A lapsing variance has to reach the customer without them opening
-- the property page.
--
-- The day after an approval expires, the property is back on the
-- utility's standard schedule -- and if its controller was set to the
-- variance schedule, it is watering illegally from that morning. A
-- silent lapse is exactly the failure this product exists to prevent,
-- so the nightly job raises it as an alert while there is still time
-- to renew.
--
-- Existing types are untouched; this only widens what is allowed.
-- ------------------------------------------------------------
alter table public.alerts drop constraint alerts_type_check;

alter table public.alerts add constraint alerts_type_check
  check (type in (
    'violation', 'push_failed', 'lcra_threshold', 'early_warning',
    'variance_expiring'
  ));

alter table public.compliance_events drop constraint compliance_events_type_check;

alter table public.compliance_events add constraint compliance_events_type_check
  check (type in (
    'check', 'violation', 'auto_correction', 'push_failed',
    'stage_confirmed', 'manual_fix_confirmed', 'variance_expiring'
  ));
