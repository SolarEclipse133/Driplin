-- ============================================================
-- Driplin migration 0030: nobody gets starved of their nightly check
--
-- WHY: the nightly job ran every organization in one serverless
-- invocation, sequentially, with no idea how long it had. Past the
-- function's 60-second limit it was simply killed: the run record was
-- never closed, and every organization after the cut was never checked at
-- all. Because the ordering was stable, that was the SAME customers every
-- night -- silently, while their dashboards showed the last good result.
--
-- At roughly half a second per controller sync that cliff arrives around
-- a hundred controllers: about ten customers with ten properties each.
-- In other words, it is reached by succeeding at sales.
--
-- Two safety nets did eventually catch it -- the heartbeat sees no
-- completed run, and a cache nobody refreshed goes stale after three
-- nights and reports "not being checked" -- so it surfaced rather than
-- lying. But for up to three nights those customers were unmonitored
-- while believing they were covered.
--
-- This column is the fairness half of the fix. The run now takes the
-- organizations that have waited longest, so a night that cannot reach
-- everyone starves different ones each time and everybody is checked
-- within a few nights rather than never. The time-budget half is in
-- lib/jobs/budget.ts, and what was skipped is recorded and alerted on.
--
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- ============================================================

alter table public.organizations
  add column last_swept_at timestamptz;

-- Oldest first, and never-swept before everything. A new customer is
-- checked on the first night they exist rather than queued behind
-- everyone who already has a timestamp.
create index organizations_sweep_order_idx
  on public.organizations (last_swept_at nulls first);

comment on column public.organizations.last_swept_at is
  'When the nightly compliance sweep last completed for this organization. Drives the order of the sweep so a run that cannot reach everyone starves a different organization each night instead of the same one.';
