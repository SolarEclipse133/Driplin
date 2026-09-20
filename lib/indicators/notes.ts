/**
 * Read-side helper: turns stored readings into a low-key "a stage
 * change may be coming" note for property managers.
 *
 * Derived from the readings table rather than from the admin alert,
 * deliberately. The early-warning alert is internal ops mail that only
 * admins may read; this note is the same underlying estimate, phrased
 * for a manager, with no permission changes and no duplicate rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DroughtStage, getJurisdiction } from "@/lib/jurisdictions";
import { analyzeTrend } from "./trend";

export interface EarlyWarningNote {
  jurisdictionId: string;
  jurisdictionName: string;
  utility: string;
  projectedStageName: string;
  daysAway: number;
  officialUrl: string;
}

export async function getEarlyWarningNotes(
  supabase: SupabaseClient,
  jurisdictionIds: string[]
): Promise<EarlyWarningNote[]> {
  if (jurisdictionIds.length === 0) return [];

  const [{ data: readings }, { data: statuses }] = await Promise.all([
    supabase
      .from("indicator_readings")
      .select("jurisdiction, value, read_at")
      .in("jurisdiction", jurisdictionIds)
      .order("reading_date", { ascending: false })
      .limit(120),
    supabase
      .from("drought_stage_status")
      .select("jurisdiction, current_stage")
      .in("jurisdiction", jurisdictionIds),
  ]);

  const confirmed = new Map<string, DroughtStage>(
    (statuses ?? []).map((s) => [
      s.jurisdiction as string,
      (s.current_stage ?? 0) as DroughtStage,
    ])
  );

  const notes: EarlyWarningNote[] = [];
  for (const id of jurisdictionIds) {
    const jurisdiction = getJurisdiction(id);
    if (!jurisdiction.indicator) continue;

    const points = (readings ?? [])
      .filter((r) => r.jurisdiction === id)
      .map((r) => ({ value: Number(r.value), readAt: r.read_at as string }));

    const analysis = analyzeTrend(points, jurisdiction.indicator.thresholds);
    const target = analysis.nextThreshold?.stage;
    if (!analysis.warn || target === undefined) continue;
    if (target <= (confirmed.get(id) ?? 0)) continue;

    notes.push({
      jurisdictionId: id,
      jurisdictionName: jurisdiction.name,
      utility: jurisdiction.utility,
      projectedStageName: jurisdiction.stages[target].name,
      daysAway: Math.round(analysis.daysToThreshold ?? 0),
      officialUrl: jurisdiction.officialUrl,
    });
  }
  return notes;
}
