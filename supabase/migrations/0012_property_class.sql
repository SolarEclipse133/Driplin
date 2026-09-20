-- ============================================================
-- Driplin migration 0012: property class and irrigation type
--
-- WHY: Austin and Leander publish DIFFERENT watering days for
-- commercial and multifamily accounts than for single-family
-- residential ones. Driplin had one table per stage, so it was
-- judging HOA common areas and apartment communities against the
-- residential schedule — and auto-correcting them onto days those
-- cities prohibit for commercial accounts.
--
-- Austin, automatic irrigation, Conservation Stage:
--   residential  -> even addresses Thursday, odd Wednesday
--   commercial   -> even addresses Tuesday,  odd Friday
--
-- Two columns fix it. Both have defaults, so every existing row stays
-- valid and no backfill is needed.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

-- How the water utility classifies the ACCOUNT the irrigation meter
-- sits on. HOA common areas, apartment communities and commercial
-- sites are 'commercial'. Defaulting to 'commercial' because that is
-- what Driplin's customers manage — an existing row is far more
-- likely to be an HOA common area than someone's front yard.
alter table public.properties
  add column property_class text not null default 'commercial'
  constraint property_class_valid
    check (property_class in ('residential', 'commercial'));

-- Austin gives drip and hose-end watering a more generous schedule
-- than automatic in-ground systems. Anything Driplin connects to a
-- smart controller is 'automatic' unless someone says otherwise.
alter table public.properties
  add column irrigation_type text not null default 'automatic'
  constraint irrigation_type_valid
    check (irrigation_type in ('automatic', 'drip_or_hose'));

comment on column public.properties.property_class is
  'Utility account class for this meter. Changes the assigned watering day in Austin and Leander.';
comment on column public.properties.irrigation_type is
  'Irrigation method on this meter. Changes the assigned watering day in Austin.';
