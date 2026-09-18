import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAllIndicatorChecks } from "@/lib/indicators/check";
import { runComplianceForOrg } from "@/lib/rules/run-compliance";

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

  const indicators = await runAllIndicatorChecks(supabase);

  const { data: orgs } = await supabase.from("organizations").select("id");
  const complianceRuns: Record<string, unknown> = {};
  for (const org of orgs ?? []) {
    complianceRuns[org.id] = await runComplianceForOrg(supabase, org.id);
  }

  return NextResponse.json({ indicators, complianceRuns });
}
