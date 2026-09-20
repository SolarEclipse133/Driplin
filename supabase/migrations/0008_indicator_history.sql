-- ============================================================
-- Driplin migration 0008: indicator history + early warnings
--
-- WHY: today each city's water-supply reading is overwritten every
-- night, so we keep only "now" and can never see a trend. This adds a
-- history table (one row per city per day) so the nightly job can spot
-- a sustained decline, plus a new alert type for that early warning.
--
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. One stored reading per city per day.
--    reading_date (Central time) is the key, so a manual pull and the
--    nightly job on the same day update one row instead of creating
--    two points that would distort a trend line.
-- ------------------------------------------------------------
create table public.indicator_readings (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  -- which indicator produced it, e.g. 'lcra_combined_storage'
  indicator_id text not null,
  -- the number the thresholds are compared against
  value numeric not null,
  -- how the source stated it, kept verbatim for the audit trail
  display_text text,
  read_at timestamptz not null,
  reading_date date not null,
  created_at timestamptz not null default now(),
  unique (jurisdiction, reading_date)
);

create index indicator_readings_lookup_idx
  on public.indicator_readings (jurisdiction, reading_date desc);

alter table public.indicator_readings enable row level security;

-- Readings are public reference data (they drive the "heads up" note
-- property managers see), so any signed-in user may read them.
create policy "All members can view indicator readings"
  on public.indicator_readings for select
  to authenticated
  using (true);

-- Only admins write them by hand; the nightly job uses the service
-- role, which bypasses row-level security.
create policy "Admins can record indicator readings"
  on public.indicator_readings for insert
  to authenticated
  with check (private.is_admin());

create policy "Admins can update indicator readings"
  on public.indicator_readings for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ------------------------------------------------------------
-- 2. Allow the new 'early_warning' alert type.
--    Existing types are unchanged; this only widens what is allowed.
-- ------------------------------------------------------------
alter table public.alerts drop constraint alerts_type_check;

alter table public.alerts add constraint alerts_type_check
  check (type in ('violation', 'push_failed', 'lcra_threshold', 'early_warning'));

-- ------------------------------------------------------------
-- 3. Backfill today's reading from the current single-value columns,
--    so the history does not start empty where we already have data.
-- ------------------------------------------------------------
insert into public.indicator_readings
  (jurisdiction, indicator_id, value, display_text, read_at, reading_date)
select
  jurisdiction,
  'backfilled',
  raw_indicator_value,
  raw_indicator_text,
  raw_indicator_read_at,
  (raw_indicator_read_at at time zone 'America/Chicago')::date
from public.drought_stage_status
where raw_indicator_value is not null
  and raw_indicator_read_at is not null
on conflict (jurisdiction, reading_date) do nothing;
