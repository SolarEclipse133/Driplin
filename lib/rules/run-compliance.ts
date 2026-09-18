/**
 * The compliance runner: for every controller in an org, sync the
 * schedule, evaluate it against the CONFIRMED stage, auto-correct
 * through the abstraction layer where the vendor allows it, and fall
 * back to manual-fix instructions (plus an alert) where it doesn't.
 *
 * Runs with whatever Supabase client it's given: a signed-in user's
 * client (org-scoped by RLS) or the service-role client from the
 * nightly cron, which loops over all orgs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getController } from "@/lib/controllers/factory";
import {
  ControllerVendor,
  ScheduleProgram,
  ScheduleWriteNotSupportedError,
} from "@/lib/controllers/types";
import { syncControllerById } from "@/lib/controllers/sync";
import { getWateringDigit } from "./address";
import { DroughtStage } from "./watering-config";
import { evaluateCompliance } from "./compliance";

export interface OrgComplianceSummary {
  checked: number;
  compliant: number;
  corrected: number;
  needsManualFix: number;
  errors: string[];
}

export async function runComplianceForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgComplianceSummary> {
  const summary: OrgComplianceSummary = {
    checked: 0,
    compliant: 0,
    corrected: 0,
    needsManualFix: 0,
    errors: [],
  };

  const { data: status } = await supabase
    .from("drought_stage_status")
    .select("current_stage")
    .single();
  const stage = (status?.current_stage ?? 0) as DroughtStage;

  const { data: controllers, error } = await supabase
    .from("controllers")
    .select(
      "id, org_id, property_id, vendor, vendor_device_id, name, properties(id, name, street_number)"
    )
    .eq("org_id", orgId);
  if (error) {
    summary.errors.push("Could not list controllers.");
    return summary;
  }

  for (const c of controllers ?? []) {
    const property = Array.isArray(c.properties) ? c.properties[0] : c.properties;
    if (!property) continue;
    summary.checked += 1;

    // 1. Refresh our cached copy of the schedule (best effort — a failed
    //    sync still lets us evaluate the last-known schedule).
    await syncControllerById(supabase, c.id);

    const { data: cached } = await supabase
      .from("cached_schedules")
      .select("schedule")
      .eq("controller_id", c.id)
      .single();
    const programs: ScheduleProgram[] =
      (cached?.schedule as { programs?: ScheduleProgram[] } | null)?.programs ?? [];

    const digit = getWateringDigit(property.street_number);
    if (digit === null) {
      summary.errors.push(`${property.name}: invalid street number.`);
      continue;
    }

    // 2. Evaluate against the confirmed stage.
    const result = evaluateCompliance(programs, digit, stage);

    await supabase.from("compliance_events").insert({
      org_id: c.org_id,
      property_id: property.id,
      controller_id: c.id,
      type: "check",
      summary: result.compliant
        ? `Compliant with ${result.rulesSnapshot.stageName} rules.`
        : `${result.findings.length} program(s) violate ${result.rulesSnapshot.stageName} rules.`,
      details: { findings: result.findings, rules: result.rulesSnapshot },
    });

    if (result.compliant) {
      summary.compliant += 1;
      await supabase
        .from("controllers")
        .update({
          compliance_status: "compliant",
          compliance_detail: { rules: result.rulesSnapshot },
          compliance_checked_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      continue;
    }

    // 3. Violation: log it, then try to push the corrected schedule.
    await supabase.from("compliance_events").insert({
      org_id: c.org_id,
      property_id: property.id,
      controller_id: c.id,
      type: "violation",
      summary: `Violation at ${property.name}: ${result.findings
        .map((f) => f.programName)
        .join(", ")}.`,
      details: { findings: result.findings, rules: result.rulesSnapshot },
    });

    // Vendor API key for the push (demo needs none).
    let apiKey: string | undefined;
    if (c.vendor !== "demo") {
      const { data: cred } = await supabase
        .from("vendor_credentials")
        .select("api_key")
        .eq("org_id", c.org_id)
        .eq("vendor", c.vendor)
        .single();
      apiKey = cred?.api_key;
    }

    try {
      const impl = getController(
        {
          id: c.id,
          vendor: c.vendor as ControllerVendor,
          vendor_device_id: c.vendor_device_id,
          name: c.name,
        },
        { apiKey, supabase }
      );
      await impl.setSchedule(result.correctedPrograms);
      // Push succeeded: re-sync the cache and record the correction.
      await syncControllerById(supabase, c.id);
      summary.corrected += 1;
      await supabase
        .from("controllers")
        .update({
          compliance_status: "compliant",
          compliance_detail: {
            rules: result.rulesSnapshot,
            corrected: true,
            findings: result.findings,
          },
          compliance_checked_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      await supabase.from("compliance_events").insert({
        org_id: c.org_id,
        property_id: property.id,
        controller_id: c.id,
        type: "auto_correction",
        summary: `Pushed corrected schedule to ${c.name} at ${property.name}.`,
        details: {
          correctedPrograms: result.correctedPrograms,
          rules: result.rulesSnapshot,
        },
      });
      await supabase.from("alerts").insert({
        org_id: c.org_id,
        property_id: property.id,
        type: "violation",
        severity: "info",
        message: `${property.name}: schedule was out of compliance and has been corrected automatically.`,
        details: { findings: result.findings },
      });
    } catch (err) {
      // 4. Push failed or unsupported → manual-fallback mode.
      summary.needsManualFix += 1;
      const reason =
        err instanceof ScheduleWriteNotSupportedError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error pushing the corrected schedule.";
      await supabase
        .from("controllers")
        .update({
          compliance_status: "needs_manual_fix",
          compliance_detail: {
            rules: result.rulesSnapshot,
            findings: result.findings,
            manualInstructions: result.manualInstructions,
            reason,
          },
          compliance_checked_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      await supabase.from("compliance_events").insert({
        org_id: c.org_id,
        property_id: property.id,
        controller_id: c.id,
        type: "push_failed",
        summary: `Could not push corrected schedule to ${c.name} at ${property.name}; manual fix required.`,
        details: { reason, manualInstructions: result.manualInstructions },
      });
      await supabase.from("alerts").insert({
        org_id: c.org_id,
        property_id: property.id,
        type: "push_failed",
        severity: "critical",
        message: `${property.name} is out of compliance and needs a manual schedule change (${c.name}).`,
        details: { manualInstructions: result.manualInstructions, reason },
      });
    }
  }

  return summary;
}
