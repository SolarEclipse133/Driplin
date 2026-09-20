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
import { analyzeTrend, TrendAnalysis, WARN_HORIZON_DAYS } from "./trend";

export interface IndicatorCheckOutcome {
  jurisdictionId: string;
  jurisdictionName: string;
  ok: boolean;
  message: string;
  suggestedStage?: DroughtStage;
  currentStage?: DroughtStage;
  alertCreated?: boolean;
  /** Result of the sustained-decline check, when one could be run. */
  trend?: { warn: boolean; explanation: string; daysToThreshold: number | null };
  earlyWarningCreated?: boolean;
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

  // 1b. Append to the reading history. Keyed by city + Central-time
  //     date, so a manual pull and the nightly job on the same day
  //     update one point rather than creating two that would bend the
  //     trend line.
  const readingDate = new Date(reading.readAt).toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
  });
  await supabase.from("indicator_readings").upsert(
    {
      jurisdiction: jurisdiction.id,
      indicator_id: jurisdiction.indicator.id,
      value: reading.value,
      display_text: reading.displayText,
      read_at: reading.readAt,
      reading_date: readingDate,
    },
    { onConflict: "jurisdiction,reading_date" }
  );

  // 2. Compare against the confirmed stage for this city.
  const { data: status } = await supabase
    .from("drought_stage_status")
    .select("current_stage")
    .eq("jurisdiction", jurisdiction.id)
    .single();
  const currentStage = (status?.current_stage ?? 0) as DroughtStage;
  const suggestedStage = jurisdiction.indicator.suggestStage(reading.value);

  // 1c. Sustained-decline check. This is separate from the threshold
  //     comparison below: it fires BEFORE a line is crossed, so an
  //     admin has notice that one may be coming. It is an estimate off
  //     a straight line, never a forecast, and it changes nothing.
  const earlyWarning = await checkEarlyWarning(
    supabase,
    jurisdiction,
    currentStage
  );

  if (suggestedStage === currentStage) {
    return {
      ...base,
      ok: true,
      message: `${jurisdiction.name}: ${reading.displayText}. Consistent with the confirmed ${jurisdiction.stages[currentStage].name}.${earlyWarning.summary}`,
      suggestedStage,
      currentStage,
      alertCreated: false,
      trend: earlyWarning.trend,
      earlyWarningCreated: earlyWarning.created,
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
    message: message + earlyWarning.summary,
    suggestedStage,
    currentStage,
    alertCreated,
    trend: earlyWarning.trend,
    earlyWarningCreated: earlyWarning.created,
  };
}

/**
 * Looks at this city's stored readings, and raises a distinct
 * "early warning" alert when supply has been falling steadily and would
 * reach the next trigger level within the warning horizon.
 *
 * Deliberately separate from the threshold alert above: that one says
 * "a line has been crossed, go verify the official notice"; this one
 * says "no line crossed yet, but you may want to watch this". Lower
 * urgency, and explicitly an estimate.
 */
async function checkEarlyWarning(
  supabase: SupabaseClient,
  jurisdiction: Jurisdiction,
  currentStage: DroughtStage
): Promise<{
  created: boolean;
  summary: string;
  trend: { warn: boolean; explanation: string; daysToThreshold: number | null };
}> {
  const indicator = jurisdiction.indicator!;
  const { data: history } = await supabase
    .from("indicator_readings")
    .select("value, read_at")
    .eq("jurisdiction", jurisdiction.id)
    .order("reading_date", { ascending: false })
    .limit(20);

  const analysis: TrendAnalysis = analyzeTrend(
    (history ?? []).map((r) => ({ value: Number(r.value), readAt: r.read_at })),
    indicator.thresholds
  );
  const trend = {
    warn: analysis.warn,
    explanation: analysis.explanation,
    daysToThreshold: analysis.daysToThreshold,
  };

  const target = analysis.nextThreshold?.stage;
  // Only worth flagging if the projected level is worse than what is
  // already confirmed — otherwise we would nag about a stage the city
  // is already in.
  if (!analysis.warn || target === undefined || target <= currentStage) {
    return { created: false, summary: "", trend };
  }

  // Deduplicate: one open early warning per city per projected stage.
  const { data: open } = await supabase
    .from("alerts")
    .select("id, details, jurisdiction")
    .eq("type", "early_warning")
    .eq("acknowledged", false)
    .is("org_id", null);
  const already = (open ?? []).some(
    (a) =>
      a.jurisdiction === jurisdiction.id &&
      (a.details as { projectedStage?: number } | null)?.projectedStage === target
  );
  if (already) return { created: false, summary: "", trend };

  const days = Math.round(analysis.daysToThreshold ?? 0);
  const verb = indicator.decliningVerb ?? "moving toward";
  const message = `Early warning (estimate, not a forecast) — ${jurisdiction.name}: ${indicator.label} has been ${verb} the ${jurisdiction.stages[target].name} trigger level. ${analysis.explanation} If that pace held, ${jurisdiction.utility} could be considering ${jurisdiction.stages[target].name} in about ${days} days. Nothing has changed and no schedule has been touched; this is a heads-up so you can watch the official notices. Rain or seasonal change can void this entirely.`;

  const { data: alert, error } = await supabase
    .from("alerts")
    .insert({
      org_id: null,
      jurisdiction: jurisdiction.id,
      type: "early_warning",
      severity: "info",
      message,
      details: {
        indicatorId: indicator.id,
        projectedStage: target,
        currentStage,
        latestValue: analysis.latestValue,
        thresholdValue: analysis.nextThreshold?.below,
        slopePerDay: analysis.slopePerDay,
        daysToThreshold: analysis.daysToThreshold,
        pointsUsed: analysis.pointsUsed,
        horizonDays: WARN_HORIZON_DAYS,
        estimateOnly: true,
      },
    })
    .select("id, org_id, type, message, details")
    .single();

  if (!error && alert) await dispatchAlertNotifications(supabase, alert);
  return {
    created: !error,
    summary: ` Early warning raised: ${analysis.explanation}`,
    trend,
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
