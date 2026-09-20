-- ============================================================
-- Driplin migration 0014: per-controller meter address
--
-- WHY: one HOA commonly has SEVERAL irrigation meters — the front
-- entrance, the pool, a median down the street — each on its own
-- service address, and therefore each on its own watering day. Until
-- now the address lived on the property, so every controller under it
-- inherited one digit. The only workaround was to create a separate
-- "property" per meter, which is a workaround, not a model.
--
-- These columns are an OVERRIDE, not a replacement. Most properties
-- have one meter and should not have to repeat the address on the
-- controller. All three are nullable: when they are null the
-- controller uses its property's address, exactly as before. Nothing
-- changes for any existing row.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

-- This meter's own street number, when it differs from the property's.
alter table public.controllers
  add column meter_street_number text
  constraint meter_street_number_format check (
    meter_street_number is null
    or meter_street_number ~ '^[0-9]+[A-Za-z]?$'
  );

-- True when THIS meter has no street address (a median, an entryway)
-- even though the property does. Null means "inherit the property".
alter table public.controllers
  add column meter_no_street_address boolean;

-- Where the meter physically is, in plain words: "North entrance",
-- "Pool equipment room", "Median at 3rd". Shown next to the
-- controller so a manager can tell two meters apart.
alter table public.controllers
  add column meter_label text;

-- A meter cannot both have a street number and have no address.
-- Null on either side leaves the check un-triggered, which is what we
-- want: null means inherit.
alter table public.controllers
  add constraint meter_address_consistent check (
    not (meter_no_street_address and meter_street_number is not null)
  );

comment on column public.controllers.meter_street_number is
  'Overrides the property street number for watering-day purposes. Null = inherit the property.';
comment on column public.controllers.meter_no_street_address is
  'True when this meter has no street address at all. Null = inherit the property.';
