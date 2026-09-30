import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAllIndicatorChecks } from "@/lib/indicators/check";
import { runComplianceForOrg } from "@/lib/rules/run-compliance";
import { upgradeLegacyCredentials } from "@/lib/controllers/credentials";
import { sendScheduledReports } from "@/lib/reports/send";
import { startRun, finishRun } from "@/lib/jobs/runs";

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
  const runId = await startRun(supabase);

  try {
  // Sweep any credential still stored in plaintext from before
  // encryption existed. Cheap, idempotent, and the only thing that
  // makes "credentials are encrypted at rest" true of every row rather
  // than only the ones that happen to get used.
  const credentials = await upgradeLegacyCredentials(supabase);

  const indicators = await runAllIndicatorChecks(supabase);

  const { data: orgs } = await supabase.from("organizations").select("id");
  const complianceRuns: Record<string, unknown> = {};
  for (const org of orgs ?? []) {
    complianceRuns[org.id] = await runComplianceForOrg(supabase, org.id);
  }

  // Board reports last: compliance is the job that must not be starved
  // if the run is running out of time.
  const reports = await sendScheduledReports(supabase);

    await finishRun(supabase, runId, {
      status: "ok",
      detail: {
        credentials,
        reports,
        organizations: Object.keys(complianceRuns).length,
        // Work orders chased for going unanswered, across all orgs.
        chased: Object.values(complianceRuns).reduce<number>(
          (n, r) => n + ((r as { chased?: number }).chased ?? 0),
          0
        ),
      },
    });

    return NextResponse.json({ credentials, indicators, complianceRuns, reports });
  } catch (err) {
    // A failed run must still be recorded, or a crash looks exactly
    // like a cron that never fired — and the two need different fixes.
    await finishRun(supabase, runId, {
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}
