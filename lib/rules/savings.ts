/**
 * Water-savings estimation for schedule corrections.
 *
 * Deliberately simple, defensible math: weekly scheduled runtime
 * before vs. after a correction, converted to gallons at a typical
 * irrigation-system flow rate. The EPA WaterSense program cites a
 * standard sprinkler system at roughly 1,020 gallons per hour
 * (~17 gal/min); commercial systems vary widely, so reports label
 * this clearly as an estimate.
 */

import { ScheduleProgram } from "@/lib/controllers/types";

export const GALLONS_PER_MINUTE_ESTIMATE = 17;

/** Total scheduled minutes of watering per week across programs. */
export function weeklyMinutes(programs: ScheduleProgram[]): number {
  return programs
    .filter((p) => p.enabled)
    .reduce((sum, p) => sum + p.days.length * p.durationMinutes, 0);
}

export function estimateWeeklySavings(
  before: ScheduleProgram[],
  after: ScheduleProgram[]
): { minutesSaved: number; gallonsSaved: number } {
  const minutesSaved = Math.max(0, weeklyMinutes(before) - weeklyMinutes(after));
  return {
    minutesSaved,
    gallonsSaved: minutesSaved * GALLONS_PER_MINUTE_ESTIMATE,
  };
}
