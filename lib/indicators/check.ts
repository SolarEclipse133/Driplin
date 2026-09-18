/**
 * The nightly indicator check, run per jurisdiction.
 *
 * IMPORTANT DESIGN CONSTRAINT (unchanged from the single-city
 * version): this NEVER changes an active drought stage or touches a
 * customer's schedule. It only:
 *   1. stores the raw reading on that city's drought_stage_status row
 *   2. raises an internal admin alert when the reading suggests a
 *      different stage than the one currently confirmed for that city
 * The stage itself changes only through explicit admin confirmation,
 * because the authoritative declaration is made by the utility.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DroughtStage,
  getJurisdiction,
  Jurisdiction,
  JURISDICTIONS,
} from "@/lib/jurisdictions";
import { dispatchAlertNotifications } from "@/lib/notifications/dispatch";

export interface IndicatorCheckOutcome {
  jurisdictionId: string;
  jurisdictionName: string;
  ok: boolean;
  message: string;
  suggestedStage?: DroughtStage;
  currentStage?: DroughtStage;
  alertCreated?: boolean;
}

export async function runIndicatorCheck(
  supabase: SupabaseClient,
  jurisdiction: Jurisdiction
): Promise<IndicatorCheckOutcome> {
  const base = {
    jurisdictionId: jurisdiction.id,
    jurisdictionName: jurisdiction.name,
  };

  if (!jurisdiction.indicator) {
    return {
      ...base,
      ok: true,
      message: `${jurisdiction.name} has no automated indicator; stages are confirmed manually.`,
    };
  }

  let reading;
  try {
    reading = await jurisdiction.indicator.fetchReading();
  } catch (err) {
    return {
      ...base,
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : `Unexpected error reading the ${jurisdiction.indicator.label}.`,
    };
  }

  // 1. Store the raw reading (never the stage).
  const { error: updateError } = await supabase
    .from("drought_stage_status")
    .update({
      raw_indicator_value: reading.value,
      raw_indicator_text: reading.displayText,
      raw_indicator_read_at: reading.readAt,
    })
    .eq("jurisdiction", jurisdiction.id);
  if (updateError) {
    return { ...base, ok: false, message: "Could not store the reading." };
  }

  // 2. Compare against the confirmed stage for this city.
  const { data: status } = await supabase
    .from("drought_stage_status")
    .select("current_stage")
    .eq("jurisdiction", jurisdiction.id)
    .single();
  const currentStage = (status?.current_stage ?? 0) as DroughtStage;
  const suggestedStage = jurisdiction.indicator.suggestStage(reading.value);

  if (suggestedStage === currentStage) {
    return {
      ...base,
      ok: true,
      message: `${jurisdiction.name}: ${reading.displayText}. Consistent with the confirmed ${jurisdiction.stages[currentStage].name}.`,
      suggestedStage,
      currentStage,
      alertCreated: false,
    };
  }

  // 3. Threshold crossing → internal admin alert, deduplicated so a
  //    reading that stays across the line doesn't alert every night.
  const { data: existing } = await supabase
    .from("alerts")
    .select("id, details, jurisdiction")
    .eq("type", "lcra_threshold")
    .eq("acknowledged", false)
    .is("org_id", null);
  const alreadyAlerted = (existing ?? []).some(
    (a) =>
      a.jurisdiction === jurisdiction.id &&
      (a.details as { suggestedStage?: number } | null)?.suggestedStage ===
        suggestedStage
  );

  const direction = suggestedStage > currentStage ? "entering" : "exiting to";
  const message = `${jurisdiction.name}: ${jurisdiction.indicator.label} is ${reading.displayText}, which suggests ${jurisdiction.utility} may be ${direction} ${jurisdiction.stages[suggestedStage].name} (currently confirmed: ${jurisdiction.stages[currentStage].name}). Verify against the official notice and confirm in the admin panel. ${jurisdiction.indicator.caveat}`;

  let alertCreated = false;
  if (!alreadyAlerted) {
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .insert({
        org_id: null,
        jurisdiction: jurisdiction.id,
        type: "lcra_threshold",
        severity: "warning",
        message,
        details: {
          indicatorId: jurisdiction.indicator.id,
          value: reading.value,
          displayText: reading.displayText,
          rawText: reading.rawText,
          suggestedStage,
          currentStage,
        },
      })
      .select("id, org_id, type, message, details")
      .single();
    alertCreated = !alertError;
    if (alert) await dispatchAlertNotifications(supabase, alert);
  }

  return {
    ...base,
    ok: true,
    message,
    suggestedStage,
    currentStage,
    alertCreated,
  };
}

/** Runs the check for every jurisdiction that has an indicator. */
export async function runAllIndicatorChecks(
  supabase: SupabaseClient
): Promise<IndicatorCheckOutcome[]> {
  const results: IndicatorCheckOutcome[] = [];
  for (const j of JURISDICTIONS) {
    results.push(await runIndicatorCheck(supabase, j));
  }
  return results;
}

export { getJurisdiction };
