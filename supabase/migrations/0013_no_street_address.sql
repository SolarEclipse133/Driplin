-- ============================================================
-- Driplin migration 0013: meters with no street address
--
-- WHY: Driplin is for shared spaces — medians, neighborhood
-- entryways, greenbelt strips, the grass along a sidewalk. Plenty of
-- those are fed by an irrigation meter with NO street address at all.
--
-- Until now the form demanded a street number, so the only way to
-- enter a median was to invent one. Driplin would then derive a
-- watering digit from a made-up number and confidently assign the
-- wrong day. A wrong answer delivered with confidence is worse than
-- no answer.
--
-- SAWS is the only one of the six cities that publishes a rule for
-- this case, and it is not a digit:
--   "Areas without a street address, such as medians and neighborhood
--    entryways, water on Wednesday."
-- Where a city publishes nothing, Driplin now says so and asks the
-- manager to check, instead of guessing.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

-- Does this meter have a street address at all?
alter table public.properties
  add column no_street_address boolean not null default false;

-- The street number becomes optional, because for a median there
-- genuinely isn't one. Existing rows all have one and are unaffected.
alter table public.properties
  alter column street_number drop not null;

-- Keep the two fields honest about each other: either the property has
-- a street number, or it is explicitly marked as having no address.
-- Never both, never neither. Every existing row satisfies this.
alter table public.properties
  add constraint street_number_presence check (
    (no_street_address and street_number is null)
    or (not no_street_address and street_number is not null)
  );

comment on column public.properties.no_street_address is
  'True for irrigation meters with no street address (medians, entryways, greenbelt strips). Watering day then comes from the city rule for such areas, not from an address digit.';
