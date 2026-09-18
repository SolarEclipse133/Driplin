import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { BoardReport, ReportData } from "@/lib/reports/board-report";
import { DroughtStage, getJurisdiction } from "@/lib/jurisdictions";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/[propertyId]?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns the board-ready compliance PDF. Auth comes from the session
 * cookie; row-level security guarantees the caller can only report on
 * their own org's properties.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/reports/[propertyId]">
) {
  const { propertyId } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Period: default to the last 90 days. Dates are treated as Central.
  const { searchParams } = new URL(request.url);
  const toParam = searchParams.get("to");
  const fromParam = searchParams.get("from");
  const to = toParam ? new Date(`${toParam}T23:59:59-06:00`) : new Date();
  const from = fromParam
    ? new Date(`${fromParam}T00:00:00-06:00`)
    : new Date(to.getTime() - 90 * 24 * 3600 * 1000);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const { data: property } = await supabase
    .from("properties")
    .select(
      "id, name, street_number, street_name, city, state, zip, unit_count, jurisdiction, organizations(name), controllers(compliance_status)"
    )
    .eq("id", propertyId)
    .single();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  const org = Array.isArray(property.organizations)
    ? property.organizations[0]
    : property.organizations;
  const controllers = Array.isArray(property.controllers)
    ? property.controllers
    : [];

  const { data: events } = await supabase
    .from("compliance_events")
    .select("type, summary, details, created_at")
    .eq("property_id", propertyId)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  // The stage that governs THIS property's city.
  const jurisdiction = getJurisdiction(property.jurisdiction);
  const { data: stageStatus } = await supabase
    .from("drought_stage_status")
    .select("current_stage, confirmed_at, source_link")
    .eq("jurisdiction", jurisdiction.id)
    .maybeSingle();

  const all = events ?? [];
  // Each correction keeps saving water every week it stays in force;
  // count the weeks from the correction until the period end.
  const gallonsSaved = all
    .filter((e) => e.type === "auto_correction")
    .reduce((sum, e) => {
      const weekly = (e.details as { estimatedWeeklyGallonsSaved?: number } | null)
        ?.estimatedWeeklyGallonsSaved;
      if (typeof weekly !== "number") return sum;
      const weeks = Math.max(
        0,
        (to.getTime() - new Date(e.created_at).getTime()) / (7 * 24 * 3600 * 1000)
      );
      return sum + weekly * weeks;
    }, 0);

  const statuses = controllers.map((c) => c.compliance_status);
  const currentStatus =
    statuses.length === 0
      ? "No controllers connected"
      : statuses.includes("needs_manual_fix")
        ? "Out of compliance — manual fix pending"
        : statuses.includes("violation")
          ? "Out of compliance"
          : statuses.every((s) => s === "compliant")
            ? "Compliant"
            : "Pending first check";

  const data: ReportData = {
    orgName: org?.name ?? "",
    property: {
      name: property.name,
      address: `${property.street_number} ${property.street_name}, ${property.city}, ${property.state} ${property.zip}`,
      unitCount: property.unit_count,
    },
    period: { from: from.toISOString(), to: to.toISOString() },
    stats: {
      checksRun: all.filter((e) => e.type === "check").length,
      violationsFound: all.filter((e) => e.type === "violation").length,
      autoCorrections: all.filter((e) => e.type === "auto_correction").length,
      manualFixesFlagged: all.filter((e) => e.type === "push_failed").length,
      estimatedGallonsSaved: gallonsSaved,
      currentStatus,
    },
    events: all.map((e) => ({
      date: e.created_at,
      type: e.type,
      summary: e.summary,
    })),
    stage: {
      stage: (stageStatus?.current_stage ?? 0) as DroughtStage,
      stageName:
        jurisdiction.stages[(stageStatus?.current_stage ?? 0) as DroughtStage]
          .name,
      utility: jurisdiction.utility,
      confirmedAt: stageStatus?.confirmed_at ?? null,
      sourceLink: stageStatus?.source_link ?? null,
    },
    generatedAt: new Date().toISOString(),
  };

  const buffer = await renderToBuffer(<BoardReport data={data} />);
  const filename = `driplin-report-${property.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
