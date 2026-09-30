-- ============================================================
-- Driplin migration 0022: notice when the nightly job stops
--
-- WHY: nothing recorded that the nightly job ran. If the cron broke —
-- a bad deploy, a rotated CRON_SECRET, a platform change — Driplin
-- would silently stop checking every property for every customer, and
-- every dashboard would keep showing green from the last successful
-- run. Nobody would find out until a city did.
--
-- That is precisely the failure this product exists to prevent,
-- turned on itself. An alert nobody receives and a check nobody runs
-- are the same kind of quiet lie.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- 'ok' | 'failed'. A run that never finishes leaves finished_at null,
  -- which the staleness check treats as not having succeeded.
  status text check (status is null or status in ('ok', 'failed')),
  -- Counts and errors, for reading after the fact.
  detail jsonb,
  error text
);

create index job_runs_job_idx on public.job_runs (job, started_at desc);

alter table public.job_runs enable row level security;

-- System-wide, not per organization: only Driplin's own admins see it.
-- Customers are told through an alert if monitoring has stopped, which
-- is the part that affects them.
create policy "Admins read job runs"
  on public.job_runs for select
  to authenticated
  using (private.is_admin());

comment on table public.job_runs is
  'One row per nightly run. Its absence is the signal: if the newest successful run is stale, monitoring has stopped.';

-- ------------------------------------------------------------
-- What customers are allowed to know about the job.
--
-- The table itself stays admin-only: its detail and error columns
-- describe every organization at once, and a customer has no business
-- reading another customer's counts or a raw stack trace.
--
-- But the one fact that DOES concern them — "has Driplin checked your
-- properties recently?" — has to reach their dashboard, or the warning
-- is dead code for exactly the people it exists for. So this function
-- reaches past the policy and returns that fact and nothing else: when
-- the last run succeeded, and whether the job has ever run at all.
-- No error text, no counts, no organization's data.
-- ------------------------------------------------------------
create or replace function public.nightly_job_health(p_job text default 'nightly')
returns table (last_success_at timestamptz, has_run boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select max(finished_at)
       from public.job_runs
      where job = p_job and status = 'ok'),
    exists (select 1 from public.job_runs where job = p_job)
$$;

revoke all on function public.nightly_job_health(text) from public;
grant execute on function public.nightly_job_health(text) to authenticated;

comment on function public.nightly_job_health(text) is
  'Whether monitoring is still running, for the customer dashboard. Deliberately returns no error text and no per-organization data.';
