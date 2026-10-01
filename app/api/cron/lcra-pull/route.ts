import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAllIndicatorChecks } from "@/lib/indicators/check";
import { runComplianceForOrg } from "@/lib/rules/run-compliance";
import { upgradeLegacyCredentials } from "@/lib/controllers/credentials";
import { sendScheduledReports } from "@/lib/reports/send";
import { startRun, finishRun } from "@/lib/jobs/runs";
import {
  reportServerError,
  reportServerWarning,
} from "@/lib/observability/report";
import { canProcessAnother, mustTryFirst } from "@/lib/jobs/budget";
import { dispatchAlertNotifications } from "@/lib/notifications/dispatch";

export const dynamic = "force-dynamic";
// 60s is the ceiling on Vercel's free (Hobby) plan; raise this after
// upgrading if the nightly run ever grows past it.
export const maxDuration = 60;

/**
 * Nightly job (Vercel Cron, see vercel.json):
 *   1. Pull each city's drought indicator (LCRA combined storage for
 *      Austin, Edwards Aquifer J-17 for San Antonio), store it, and
 *      raise an internal admin alert on a threshold crossing. This
 *      NEVER changes an active stage — that's admin-confirmed only.
 *   2. Re-run compliance for every organization against the currently
 *      CONFIRMED stage of each property's city.
 *
 * Secured with CRON_SECRET: Vercel sends it as a Bearer token.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Not configured" },
      { status: 500 }
    );
  }

  // Record that this run happened. Its absence is what tells anyone
  // that monitoring has stopped, so it is opened before any work and
  // closed whatever the outcome.
  const startedAt = Date.now();
  const runId = await startRun(supabase);

  try {
  // Sweep any credential still stored in plaintext from before
  // encryption existed. Cheap, idempotent, and the only thing that
  // makes "credentials are encrypted at rest" true of every row rather
  // than only the ones that happen to get used.
  const credentials = await upgradeLegacyCredentials(supabase);

  const indicators = await runAllIndicatorChecks(supabase);

  // Longest-waiting first. A night that cannot reach everyone then starves
  // a different organization each time, rather than the same ones forever.
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id")
    .order("last_swept_at", { ascending: true, nullsFirst: true });

  const budget = {
    startedAt,
    limitMs: maxDuration * 1000,
    // Held back for closing the run record and raising the alert below.
    // Spending the whole budget on organizations is how a run ends with
    // no record of having ended.
    reserveMs: 12_000,
  };

  const complianceRuns: Record<string, unknown> = {};
  const skipped: string[] = [];
  let stoppedBecause: string | null = null;

  for (const org of orgs ?? []) {
    const done = Object.keys(complianceRuns).length;
    const verdict = canProcessAnother(budget, Date.now(), done);

    // Always attempt the first: a run that checks nobody, night after
    // night, looks exactly like a working system.
    if (!verdict.proceed && !mustTryFirst(done)) {
      stoppedBecause ??= verdict.reason;
      skipped.push(org.id as string);
      continue;
    }

    complianceRuns[org.id] = await runComplianceForOrg(supabase, org.id);
    // Stamp it only once the sweep actually finished, so an organization
    // cut short keeps its place at the front of the queue.
    await supabase
      .from("organizations")
      .update({ last_swept_at: new Date().toISOString() })
      .eq("id", org.id);
  }

  // Outgrowing one invocation is an operational fact somebody has to act
  // on, not something to discover from a quiet dashboard.
  if (skipped.length > 0) {
    reportServerWarning(
      "cron.nightly_incomplete",
      `Ran out of time after ${Object.keys(complianceRuns).length} organizations`,
      { skipped: skipped.length, reason: stoppedBecause }
    );
    const { data: alert } = await supabase
      .from("alerts")
      .insert({
        org_id: null,
        type: "lcra_threshold",
        severity: "critical",
        message: `Driplin's nightly run could not check ${skipped.length} organization(s) in time (${stoppedBecause}). They are first in the queue tomorrow, but the job has outgrown one invocation and needs splitting.`,
        details: { skipped: skipped.length, reason: stoppedBecause },
      })
      .select("id, org_id, property_id, type, message, details")
      .single();
    if (alert) await dispatchAlertNotifications(supabase, alert);
  }

  // Board reports last: compliance is the job that must not be starved if
  // the run is running out of time. Now actually enforced rather than only
  // intended -- a report is a nicety, and overrunning here would kill the
  // run before it could close its own record or say what it skipped.
  const timeForReports = canProcessAnother(budget, Date.now(), 1).proceed;
  const reports = timeForReports
    ? await sendScheduledReports(supabase)
    : { sent: 0, skipped: "no time left in this run" };

    await finishRun(supabase, runId, {
      status: "ok",
      detail: {
        credentials,
        reports,
        organizations: Object.keys(complianceRuns).length,
        // Organizations the run could not reach. Anything above zero means
        // the job no longer fits in one invocation.
        skipped: skipped.length,
        stoppedBecause,
        elapsedMs: Date.now() - startedAt,
        // Work orders chased for going unanswered, across all orgs.
        chased: Object.values(complianceRuns).reduce<number>(
          (n, r) => n + ((r as { chased?: number }).chased ?? 0),
          0
        ),
        // Controllers Driplin could not read, so made no claim about. A
        // number that climbs here means connections are breaking.
        unreadable: Object.values(complianceRuns).reduce<number>(
          (n, r) => n + ((r as { unreadable?: number }).unreadable ?? 0),
          0
        ),
      },
    });

    return NextResponse.json({ credentials, indicators, complianceRuns, reports });
  } catch (err) {
    reportServerError("cron.nightly_failed", err, { job: "nightly" });
    // A failed run must still be recorded, or a crash looks exactly
    // like a cron that never fired — and the two need different fixes.
    await finishRun(supabase, runId, {
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}
