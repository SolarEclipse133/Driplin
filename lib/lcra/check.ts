/**
 * The nightly LCRA check. IMPORTANT DESIGN CONSTRAINT (per the product
 * spec): this NEVER changes the active drought stage or touches any
 * customer's schedule. It only:
 *   1. stores the raw reading in drought_stage_status.raw_lcra_*
 *   2. raises an internal admin alert when the reading suggests a
 *      different stage than the one currently confirmed.
 * The stage itself changes only through explicit admin confirmation
 * (see the admin panel), because the legally authoritative declaration
 * is made by the City of Austin, not by a lake gauge.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchAlertNotifications } from "@/lib/notifications/dispatch";
import { fetchLcraCombinedStorage, LcraError } from "./hydromet";
import {
  DroughtStage,
  STAGE_NAMES,
  suggestedStageForReading,
} from "@/lib/rules/watering-config";

export interface LcraCheckOutcome {
  ok: boolean;
  message: string;
  reading?: { acreFeet: number; percentText: string };
  suggestedStage?: DroughtStage;
  currentStage?: DroughtStage;
  alertCreated?: boolean;
}

export async function runLcraCheck(
  supabase: SupabaseClient
): Promise<LcraCheckOutcome> {
  let reading;
  try {
    reading = await fetchLcraCombinedStorage();
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof LcraError
          ? err.message
          : "Unexpected error fetching the LCRA reading.",
    };
  }

  // 1. Store the raw reading (never the stage).
  const { error: updateError } = await supabase
    .from("drought_stage_status")
    .update({
      raw_lcra_reading: reading.acreFeet,
      raw_lcra_percent: reading.percentText,
      raw_lcra_read_at: reading.readAt,
    })
    .eq("singleton", true);
  if (updateError) {
    return { ok: false, message: "Could not store the LCRA reading." };
  }

  // 2. Compare against the confirmed stage.
  const { data: status } = await supabase
    .from("drought_stage_status")
    .select("current_stage")
    .single();
  const currentStage = (status?.current_stage ?? 0) as DroughtStage;
  const suggestedStage = suggestedStageForReading(reading.acreFeet);

  if (suggestedStage === currentStage) {
    return {
      ok: true,
      message: `Reading stored: ${reading.acreFeet.toLocaleString()} acre-feet (${reading.percentText}). Consistent with the confirmed ${STAGE_NAMES[currentStage]}.`,
      reading,
      suggestedStage,
      currentStage,
      alertCreated: false,
    };
  }

  // 3. Threshold crossing → internal admin alert, deduplicated so a
  //    reading that stays across the line doesn't alert every night.
  const { data: existing } = await supabase
    .from("alerts")
    .select("id, details")
    .eq("type", "lcra_threshold")
    .eq("acknowledged", false)
    .is("org_id", null);
  const alreadyAlerted = (existing ?? []).some(
    (a) =>
      (a.details as { suggestedStage?: number } | null)?.suggestedStage ===
      suggestedStage
  );

  const direction = suggestedStage > currentStage ? "entering" : "exiting to";
  const message = `LCRA combined storage is ${reading.acreFeet.toLocaleString()} acre-feet (${reading.percentText}), which suggests Austin may be ${direction} ${STAGE_NAMES[suggestedStage]} (currently confirmed: ${STAGE_NAMES[currentStage]}). Verify against the official Austin Water notice and confirm in the admin panel. Note: recovery to Conservation requires a sustained multi-month projection above 1.4M acre-feet, not a single day's crossing.`;

  let alertCreated = false;
  if (!alreadyAlerted) {
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .insert({
        org_id: null,
        type: "lcra_threshold",
        severity: "warning",
        message,
        details: {
          acreFeet: reading.acreFeet,
          percentText: reading.percentText,
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
    ok: true,
    message,
    reading,
    suggestedStage,
    currentStage,
    alertCreated,
  };
}
