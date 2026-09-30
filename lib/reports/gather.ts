import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DroughtStage, getJurisdiction } from "@/lib/jurisdictions";
import { downloadPhoto, PDF_EMBEDDABLE_TYPES } from "@/lib/photos/store";
import type { ReportData } from "./board-report";

/**
 * Assembles a property's board report.
 *
 * Lifted out of the download route so the scheduled sender produces
 * exactly the same document. Two code paths building "the report"
 * would drift, and the one nobody looks at would drift first.
 */
export async function gatherReportData(
  supabase: SupabaseClient,
  propertyId: string,
  from: Date,
  to: Date
): Promise<ReportData | null> {
  const { data: property } = await supabase
    .from("properties")
    .select(
      "id, name, street_number, street_name, city, state, zip, unit_count, jurisdiction, organizations(name), controllers(compliance_status)"
    )
    .eq("id", propertyId)
    .single();
  if (!property) return null;
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

  // Photo proof from manual fixes inside the reporting period.
  const { data: photoRows } = await supabase
    .from("manual_fix_confirmations")
    .select("created_at, confirmed_by_name, confirmed_via, note, verified, photo_path, photo_mime")
    .eq("property_id", propertyId)
    .not("photo_path", "is", null)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: false })
    .limit(12);

  const photos = [];
  for (const row of photoRows ?? []) {
    let dataUri: string | null = null;
    if (row.photo_mime && PDF_EMBEDDABLE_TYPES.includes(row.photo_mime)) {
      const buf = await downloadPhoto(supabase, row.photo_path as string);
      if (buf) dataUri = `data:${row.photo_mime};base64,${buf.toString("base64")}`;
    }
    photos.push({
      date: row.created_at as string,
      by: row.confirmed_by_name as string,
      via: row.confirmed_via as "manager" | "vendor",
      note: (row.note as string | null) ?? null,
      verified: row.verified as boolean | null,
      dataUri,
    });
  }

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
    photos,
    generatedAt: new Date().toISOString(),
  };

  return data;
}
