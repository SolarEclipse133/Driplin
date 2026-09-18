"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runLcraCheck } from "@/lib/lcra/check";
import { runComplianceForOrg } from "@/lib/rules/run-compliance";
import { DroughtStage, STAGE_NAMES } from "@/lib/rules/watering-config";

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

/** Manual trigger of the same check the nightly cron runs. */
export async function pullLcraNow(
  _prev: AdminActionState,
  _formData: FormData
): Promise<AdminActionState> {
  const { supabase, admin } = await requireAdmin();
  if (!admin) return { error: "Admin access required.", success: null };

  const outcome = await runLcraCheck(supabase);
  revalidatePath("/admin");
  if (!outcome.ok) return { error: outcome.message, success: null };
  return {
    error: null,
    success:
      outcome.message + (outcome.alertCreated ? " (Internal alert created.)" : ""),
  };
}

/**
 * THE stage change: only an admin, only with a source link. Updates
 * the confirmed stage, logs it, then re-runs compliance so corrected
 * schedules go out — for the admin's own org immediately; every other
 * org is picked up by the nightly cron run against the new stage.
 */
export async function confirmStage(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const { supabase, admin } = await requireAdmin();
  if (!admin) return { error: "Admin access required.", success: null };

  const stageRaw = Number(formData.get("stage"));
  const sourceLink = String(formData.get("source_link") ?? "").trim();

  if (![0, 1, 2, 3, 4].includes(stageRaw))
    return { error: "Pick a valid stage.", success: null };
  const stage = stageRaw as DroughtStage;

  let url: URL;
  try {
    url = new URL(sourceLink);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    return {
      error:
        "Paste the URL of the official notice (e.g. the Austin Water announcement) — it's required for the audit trail.",
      success: null,
    };
  }

  const { error } = await supabase
    .from("drought_stage_status")
    .update({
      current_stage: stage,
      confirmed_at: new Date().toISOString(),
      confirmed_by: admin.id,
      source_link: url.toString(),
    })
    .eq("singleton", true);
  if (error) return { error: "Could not update the stage.", success: null };

  await supabase.from("compliance_events").insert({
    org_id: null,
    type: "stage_confirmed",
    summary: `${STAGE_NAMES[stage]} confirmed as active.`,
    details: { stage, sourceLink: url.toString(), confirmedBy: admin.id },
  });

  // Acknowledge any open LCRA threshold alerts that suggested this stage.
  const { data: openAlerts } = await supabase
    .from("alerts")
    .select("id, details")
    .eq("type", "lcra_threshold")
    .eq("acknowledged", false)
    .is("org_id", null);
  for (const a of openAlerts ?? []) {
    if ((a.details as { suggestedStage?: number } | null)?.suggestedStage === stage) {
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
  return {
    error: null,
    success: `${STAGE_NAMES[stage]} is now the confirmed stage. Compliance re-run for your org: ${summary.checked} controller(s) checked, ${summary.corrected} corrected, ${summary.needsManualFix} need a manual fix. Other orgs update on the nightly run.`,
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
