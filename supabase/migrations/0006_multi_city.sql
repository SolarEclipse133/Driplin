-- ============================================================
-- Driplin migration 0006: multi-city support
--
--   * drought_stage_status becomes one row PER JURISDICTION
--     (was a single global row)
--   * properties carry a jurisdiction
--   * indicator columns renamed from LCRA-specific to generic
--
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. properties.jurisdiction
-- ------------------------------------------------------------
alter table public.properties
  add column jurisdiction text not null default 'austin';

-- Existing San Antonio properties (if any) move to the right city.
update public.properties
set jurisdiction = 'san_antonio'
where lower(trim(city)) = 'san antonio';

-- ------------------------------------------------------------
-- 2. drought_stage_status: one row per jurisdiction
-- ------------------------------------------------------------
alter table public.drought_stage_status
  add column jurisdiction text;

update public.drought_stage_status set jurisdiction = 'austin';

-- Swap the single-row primary key for a per-jurisdiction one.
alter table public.drought_stage_status
  drop constraint drought_stage_status_pkey;

alter table public.drought_stage_status
  alter column jurisdiction set not null,
  add primary key (jurisdiction);

alter table public.drought_stage_status
  drop column singleton;

-- Generic indicator columns (the LCRA reading is now just one of
-- several possible indicators — San Antonio uses the Edwards Aquifer
-- J-17 well level instead).
alter table public.drought_stage_status
  rename column raw_lcra_reading to raw_indicator_value;
alter table public.drought_stage_status
  rename column raw_lcra_percent to raw_indicator_text;
alter table public.drought_stage_status
  rename column raw_lcra_read_at to raw_indicator_read_at;

-- Seed the cities the app knows about (safe to re-run).
insert into public.drought_stage_status (jurisdiction, current_stage)
values ('san_antonio', 0)
on conflict (jurisdiction) do nothing;

-- ------------------------------------------------------------
-- 3. Alerts carry the jurisdiction they belong to, so an internal
--    threshold alert says WHICH city needs verification.
-- ------------------------------------------------------------
alter table public.alerts
  add column jurisdiction text;

update public.alerts set jurisdiction = 'austin'
where type = 'lcra_threshold' and jurisdiction is null;
