"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runIndicatorCheck } from "@/lib/indicators/check";
import { runComplianceForOrg } from "@/lib/rules/run-compliance";
import {
  ALL_STAGES,
  DroughtStage,
  getJurisdiction,
  JURISDICTIONS,
} from "@/lib/jurisdictions";

export type AdminActionState = { error: string | null; success: string | null };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, admin: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { supabase, admin: null };
  return { supabase, admin: profile };
}

function validJurisdiction(id: string): boolean {
  return JURISDICTIONS.some((j) => j.id === id);
}

/** Manual trigger of the same indicator check the nightly cron runs. */
export async function pullIndicatorNow(
  jurisdictionId: string,
  _prev: AdminActionState,
  _formData: FormData
): Promise<AdminActionState> {
  const { supabase, admin } = await requireAdmin();
  if (!admin) return { error: "Admin access required.", success: null };
  if (!validJurisdiction(jurisdictionId))
    return { error: "Unknown city.", success: null };

  const outcome = await runIndicatorCheck(
    supabase,
    getJurisdiction(jurisdictionId)
  );
  revalidatePath("/admin");
  if (!outcome.ok) return { error: outcome.message, success: null };
  return {
    error: null,
    success:
      outcome.message + (outcome.alertCreated ? " (Internal alert created.)" : ""),
  };
}

/**
 * THE stage change: only an admin, only with a source link, and only
 * for one city at a time. Updates that city's confirmed stage, logs
 * it, then re-runs compliance so corrected schedules go out.
 */
export async function confirmStage(
  jurisdictionId: string,
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const { supabase, admin } = await requireAdmin();
  if (!admin) return { error: "Admin access required.", success: null };
  if (!validJurisdiction(jurisdictionId))
    return { error: "Unknown city.", success: null };

  const jurisdiction = getJurisdiction(jurisdictionId);
  const stageRaw = Number(formData.get("stage"));
  const sourceLink = String(formData.get("source_link") ?? "").trim();

  if (!ALL_STAGES.includes(stageRaw as DroughtStage))
    return { error: "Pick a valid stage.", success: null };
  const stage = stageRaw as DroughtStage;

  let url: URL;
  try {
    url = new URL(sourceLink);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    return {
      error: `Paste the URL of the official ${jurisdiction.utility} notice — it's required for the audit trail.`,
      success: null,
    };
  }

  const { data: updated, error } = await supabase
    .from("drought_stage_status")
    .update({
      current_stage: stage,
      confirmed_at: new Date().toISOString(),
      confirmed_by: admin.id,
      source_link: url.toString(),
    })
    .eq("jurisdiction", jurisdiction.id)
    .select("jurisdiction");
  if (error) return { error: "Could not update the stage.", success: null };
  // A city added in code but never seeded in the database would silently
  // update nothing and report success — catch that instead.
  if (!updated || updated.length === 0) {
    return {
      error: `No stage record exists for ${jurisdiction.name} yet. Run the latest database migration (see SETUP.md), then try again.`,
      success: null,
    };
  }

  await supabase.from("compliance_events").insert({
    org_id: null,
    type: "stage_confirmed",
    summary: `${jurisdiction.name}: ${jurisdiction.stages[stage].name} confirmed as active.`,
    details: {
      jurisdiction: jurisdiction.id,
      stage,
      sourceLink: url.toString(),
      confirmedBy: admin.id,
    },
  });

  // Acknowledge open threshold alerts for this city that suggested it.
  const { data: openAlerts } = await supabase
    .from("alerts")
    .select("id, details, jurisdiction")
    .eq("type", "lcra_threshold")
    .eq("acknowledged", false)
    .is("org_id", null);
  for (const a of openAlerts ?? []) {
    if (
      a.jurisdiction === jurisdiction.id &&
      (a.details as { suggestedStage?: number } | null)?.suggestedStage === stage
    ) {
      await supabase
        .from("alerts")
        .update({ acknowledged: true, acknowledged_by: admin.id })
        .eq("id", a.id);
    }
  }

  const summary = await runComplianceForOrg(supabase, admin.org_id);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/properties");

  const unverifiedNote = jurisdiction.stages[stage].verified
    ? ""
    : ` Note: Driplin has not verified ${jurisdiction.utility}'s published rules for this stage, so affected properties are flagged for manual review instead of being corrected automatically.`;

  return {
    error: null,
    success: `${jurisdiction.name} is now confirmed at ${jurisdiction.stages[stage].name}. Compliance re-run for your org: ${summary.checked} controller(s) checked, ${summary.corrected} corrected, ${summary.needsManualFix} need a manual fix${summary.uncertified > 0 ? `, ${summary.uncertified} not evaluated (city schedule unconfirmed)` : ""}. Other orgs update on the nightly run.${unverifiedNote}`,
  };
}

export async function acknowledgeAlert(formData: FormData): Promise<void> {
  const alertId = String(formData.get("alert_id") ?? "");
  if (!alertId) return;
  const { supabase, admin } = await requireAdmin();
  if (!admin) return;
  await supabase
    .from("alerts")
    .update({ acknowledged: true, acknowledged_by: admin.id })
    .eq("id", alertId);
  revalidatePath("/admin");
}
