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
import { dispatchAlertNotifications } from "@/lib/notifications/dispatch";
import { getWateringDigit } from "./address";
import {
  DEFAULT_PROFILE,
  type IrrigationType,
  type PropertyClass,
  type PropertyProfile,
} from "@/lib/jurisdictions";

/**
 * Which published watering table applies to this property. Rows written
 * before the class/type columns existed fall back to Driplin's own
 * default: a commercial account on an automatic system.
 */
function profileOf(property: {
  property_class?: string | null;
  irrigation_type?: string | null;
  no_street_address?: boolean | null;
}): PropertyProfile {
  return {
    propertyClass:
      (property.property_class as PropertyClass) ??
      DEFAULT_PROFILE.propertyClass,
    irrigationType:
      (property.irrigation_type as IrrigationType) ??
      DEFAULT_PROFILE.irrigationType,
    noStreetAddress: property.no_street_address === true,
  };
}

/**
 * The address digit, or 0 for a meter with no street address. The zero
 * is never read as a digit: those properties resolve to the city's rule
 * for address-less areas, or to no judgement at all.
 */
function digitFor(property: {
  street_number?: string | null;
  no_street_address?: boolean | null;
}): number | null {
  if (property.no_street_address) return 0;
  return getWateringDigit(property.street_number ?? "");
}
import { DroughtStage, getJurisdiction } from "@/lib/jurisdictions";
import { evaluateCompliance } from "./compliance";
import { estimateWeeklySavings } from "./savings";

export interface OrgComplianceSummary {
  checked: number;
  compliant: number;
  corrected: number;
  needsManualFix: number;
  /** Controllers in cities whose published schedule we can't confirm. */
  uncertified: number;
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
    uncertified: 0,
    errors: [],
  };

  // Confirmed stage per city — a portfolio can span jurisdictions.
  const { data: stageRows } = await supabase
    .from("drought_stage_status")
    .select("jurisdiction, current_stage");
  const stageByJurisdiction = new Map<string, DroughtStage>(
    (stageRows ?? []).map((r) => [
      r.jurisdiction as string,
      (r.current_stage ?? 0) as DroughtStage,
    ])
  );

  const { data: controllers, error } = await supabase
    .from("controllers")
    .select(
      "id, org_id, property_id, vendor, vendor_device_id, name, properties(id, name, street_number, jurisdiction, property_class, irrigation_type, no_street_address)"
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

    const digit = digitFor(property);
    if (digit === null) {
      summary.errors.push(`${property.name}: invalid street number.`);
      continue;
    }

    // 2. Evaluate against the confirmed stage for THIS property's city.
    const jurisdictionId = property.jurisdiction ?? "austin";
    const stage = stageByJurisdiction.get(jurisdictionId) ?? 0;
    const result = evaluateCompliance(
      programs,
      digit,
      stage,
      jurisdictionId,
      profileOf(property)
    );

    // Cities whose published schedule we haven't been able to confirm:
    // report honestly instead of judging against a guess.
    if (!result.certified) {
      summary.uncertified += 1;
      await supabase
        .from("controllers")
        .update({
          compliance_status: "unknown",
          compliance_detail: {
            rules: result.rulesSnapshot,
            uncertified: true,
            manualInstructions: result.manualInstructions,
            officialUrl: result.officialUrl,
          },
          compliance_checked_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      await supabase.from("compliance_events").insert({
        org_id: c.org_id,
        property_id: property.id,
        controller_id: c.id,
        type: "check",
        summary: `${result.rulesSnapshot.jurisdictionName}'s published watering schedule is not yet confirmed in Driplin, so this controller was not evaluated.`,
        details: {
          rules: result.rulesSnapshot,
          officialUrl: result.officialUrl,
        },
      });
      continue;
    }

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
      // Safety rule: never push a schedule derived from rules we have
      // not verified against the city's published ordinance. Flag it
      // for a human instead — a wrong schedule is worse than none.
      if (!result.rulesVerified) {
        throw new ScheduleWriteNotSupportedError(
          c.vendor as ControllerVendor,
          `Driplin has not verified ${getJurisdiction(jurisdictionId).utility}'s published rules for ${result.rulesSnapshot.stageName}, so it will not change this schedule automatically`
        );
      }

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
      const savings = estimateWeeklySavings(programs, result.correctedPrograms);
      await supabase.from("compliance_events").insert({
        org_id: c.org_id,
        property_id: property.id,
        controller_id: c.id,
        type: "auto_correction",
        summary: `Pushed corrected schedule to ${c.name} at ${property.name}.`,
        details: {
          correctedPrograms: result.correctedPrograms,
          rules: result.rulesSnapshot,
          estimatedWeeklyMinutesSaved: savings.minutesSaved,
          estimatedWeeklyGallonsSaved: savings.gallonsSaved,
        },
      });
      const { data: correctionAlert } = await supabase
        .from("alerts")
        .insert({
          org_id: c.org_id,
          property_id: property.id,
          type: "violation",
          severity: "info",
          message: `${property.name}: schedule was out of compliance and has been corrected automatically.`,
          details: { findings: result.findings },
        })
        .select("id, org_id, type, message, details")
        .single();
      if (correctionAlert)
        await dispatchAlertNotifications(supabase, correctionAlert);
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
      const { data: manualAlert } = await supabase
        .from("alerts")
        .insert({
          org_id: c.org_id,
          property_id: property.id,
          type: "push_failed",
          severity: "critical",
          message: `${property.name} is out of compliance and needs a manual schedule change (${c.name}).`,
          details: { manualInstructions: result.manualInstructions, reason },
        })
        .select("id, org_id, type, message, details")
        .single();
      if (manualAlert) await dispatchAlertNotifications(supabase, manualAlert);
    }
  }

  return summary;
}

/**
 * Re-read ONE controller and judge it against its city's confirmed
 * stage, updating its stored status.
 *
 * Used when somebody says they have fixed a controller by hand: we go
 * and look rather than taking their word for it. A claim is not proof,
 * and being able to check it is the whole advantage of being connected
 * to the controller in the first place.
 */
export interface SingleControllerCheck {
  ok: boolean;
  /** Null when we could not judge (city rules unconfirmed, bad data). */
  compliant: boolean | null;
  /** What is still wrong, in the manager's words. */
  remainingProblems: string[];
  message: string;
  propertyId?: string;
  propertyName?: string;
  orgId?: string;
}

export async function verifyControllerNow(
  supabase: SupabaseClient,
  controllerId: string
): Promise<SingleControllerCheck> {
  const { data: c } = await supabase
    .from("controllers")
    .select(
      "id, org_id, vendor, vendor_device_id, name, properties(id, name, street_number, jurisdiction, property_class, irrigation_type, no_street_address)"
    )
    .eq("id", controllerId)
    .single();
  if (!c) {
    return {
      ok: false,
      compliant: null,
      remainingProblems: [],
      message: "Controller not found.",
    };
  }
  const property = Array.isArray(c.properties) ? c.properties[0] : c.properties;
  if (!property) {
    return {
      ok: false,
      compliant: null,
      remainingProblems: [],
      message: "Controller is not attached to a property.",
    };
  }
  const base = {
    propertyId: property.id as string,
    propertyName: property.name as string,
    orgId: c.org_id as string,
  };

  // Pull the controller's current schedule before judging it.
  const sync = await syncControllerById(supabase, controllerId);

  const { data: cached } = await supabase
    .from("cached_schedules")
    .select("schedule")
    .eq("controller_id", controllerId)
    .single();
  const programs: ScheduleProgram[] =
    (cached?.schedule as { programs?: ScheduleProgram[] } | null)?.programs ?? [];

  const digit = digitFor(property);
  if (digit === null) {
    return {
      ...base,
      ok: false,
      compliant: null,
      remainingProblems: [],
      message: "This property's street number is not a valid address number.",
    };
  }

  const jurisdictionId = property.jurisdiction ?? "austin";
  const { data: stageRow } = await supabase
    .from("drought_stage_status")
    .select("current_stage")
    .eq("jurisdiction", jurisdictionId)
    .maybeSingle();
  const stage = (stageRow?.current_stage ?? 0) as DroughtStage;

  const result = evaluateCompliance(
    programs,
    digit,
    stage,
    jurisdictionId,
    profileOf(property)
  );

  const status = !result.certified
    ? "unknown"
    : result.compliant
      ? "compliant"
      : "needs_manual_fix";

  await supabase
    .from("controllers")
    .update({
      compliance_status: status,
      compliance_detail: {
        rules: result.rulesSnapshot,
        findings: result.findings,
        manualInstructions: result.manualInstructions,
        uncertified: !result.certified,
        officialUrl: result.officialUrl,
      },
      compliance_checked_at: new Date().toISOString(),
    })
    .eq("id", controllerId);

  if (!result.certified) {
    return {
      ...base,
      ok: true,
      compliant: null,
      remainingProblems: [],
      message: `Recorded. Driplin has not confirmed ${result.rulesSnapshot.jurisdictionName}'s published schedule, so it cannot check this controller against it.`,
    };
  }

  if (result.compliant) {
    return {
      ...base,
      ok: true,
      compliant: true,
      remainingProblems: [],
      message: sync.ok
        ? `Verified — ${c.name} now matches the ${result.rulesSnapshot.stageName} rules.`
        : `Recorded. We could not reach ${c.name} just now, but its last known schedule matches the ${result.rulesSnapshot.stageName} rules.`,
    };
  }

  const problems = result.findings.flatMap((f) =>
    f.problems.map((p) => `${f.programName}: ${p}`)
  );
  return {
    ...base,
    ok: true,
    compliant: false,
    remainingProblems: problems,
    message: `Recorded, but ${c.name} still does not match the ${result.rulesSnapshot.stageName} rules.`,
  };
}
