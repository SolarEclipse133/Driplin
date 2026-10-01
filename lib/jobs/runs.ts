import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assessHealth, type JobHealth } from "./health";

/**
 * A record that the nightly job ran.
 *
 * The point is not the record. The point is its ABSENCE: if the newest
 * successful run is older than a day and a bit, monitoring has stopped
 * and nobody has been told. Driplin's whole promise is noticing when
 * something silently stopped being true; it should hold itself to that.
 */

export const NIGHTLY_JOB = "nightly";

export async function startRun(
  supabase: SupabaseClient,
  job: string = NIGHTLY_JOB
): Promise<string | null> {
  const { data } = await supabase
    .from("job_runs")
    .insert({ job, started_at: new Date().toISOString() })
    .select("id")
    .single();
  return (data?.id as string) ?? null;
}

export async function finishRun(
  supabase: SupabaseClient,
  runId: string | null,
  outcome: { status: "ok" | "failed"; detail?: unknown; error?: string }
): Promise<void> {
  if (!runId) return;
  await supabase
    .from("job_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: outcome.status,
      detail: (outcome.detail as Record<string, unknown>) ?? null,
      error: outcome.error ?? null,
    })
    .eq("id", runId);
}

/**
 * Health for a customer's dashboard.
 *
 * Goes through public.nightly_job_health() rather than reading the
 * table, because the table's policy only admits Driplin admins — a
 * direct read from a customer's session returns no rows, which would
 * look exactly like "the job has never run" and silently suppress the
 * warning for every person it is meant to protect.
 *
 * Carries no error text: the customer needs to know that monitoring
 * stopped, not what our stack trace said.
 */
export async function getMonitoringHealth(
  supabase: SupabaseClient,
  job: string = NIGHTLY_JOB,
  now: number = Date.now()
): Promise<JobHealth> {
  const { data, error } = await supabase
    .rpc("nightly_job_health", { p_job: job })
    .maybeSingle();

  // If the health check itself cannot be read, say nothing rather than
  // claiming monitoring has stopped. A false alarm on the dashboard
  // costs more trust than it buys.
  if (error || !data) return assessHealth(null, null, true, now);

  const row = data as { last_success_at: string | null; has_run: boolean };
  return assessHealth(row.last_success_at, null, !row.has_run, now);
}

/** Full health, including the last error. Admin views only. */
export async function getJobHealth(
  supabase: SupabaseClient,
  job: string = NIGHTLY_JOB,
  now: number = Date.now()
): Promise<JobHealth> {
  const [{ data: lastOk }, { data: lastAny }] = await Promise.all([
    supabase
      .from("job_runs")
      .select("finished_at")
      .eq("job", job)
      .eq("status", "ok")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("job_runs")
      .select("status, error, started_at")
      .eq("job", job)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return assessHealth(
    (lastOk?.finished_at as string) ?? null,
    (lastAny?.error as string) ?? null,
    !lastAny,
    now
  );
}

/**
 * Can the nightly job even authenticate itself?
 *
 * The heartbeat has one blind spot: the cron route checks CRON_SECRET and
 * builds its admin client BEFORE recording anything, so a wrong secret or
 * a missing service-role key produces no record at all -- which looks
 * exactly like a cron that never fired, the very distinction the
 * heartbeat exists to draw.
 *
 * Recording unauthenticated requests would be worse: anyone who found the
 * URL could fill the table. So instead the admin panel reports whether
 * the job COULD authenticate, which turns "never run" from a puzzle into
 * one of two specific things to check.
 *
 * Returns presence only. No secret value goes anywhere near a response.
 */
export function cronConfig(): { secretSet: boolean; adminKeySet: boolean } {
  return {
    secretSet: (process.env.CRON_SECRET ?? "").length > 0,
    adminKeySet: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").length > 0,
  };
}
