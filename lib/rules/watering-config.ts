/**
 * ============================================================
 * STATIC WATERING RULES CONFIG — the single source of truth for
 * Austin's watering-day assignment and per-stage time windows.
 * ============================================================
 *
 * SOURCE: City of Austin Drought Contingency Plan (council-approved,
 * last updated November 2024) and Austin Water's "Your Watering
 * Schedule" page: https://www.austintexas.gov/department/water-conservation
 * Austin City Code Chapter 6-4 (Water Conservation).
 *
 * Austin assigns automatic-irrigation watering days by the LAST DIGIT
 * of the street address number. This table is deliberately hardcoded:
 * these rules change on the order of YEARS (via council action), not
 * days, so live-fetching them would add fragility for no benefit.
 *
 * >>> TO EDIT: change the day lists / time windows below, redeploy. <<<
 * >>> Verify values against the official page above before launch.  <<<
 *
 * Stage numbering used across Driplin:
 *   0 = Conservation Stage (permanent, no drought declared)
 *   1 = Stage 1 · 2 = Stage 2 · 3 = Stage 3 · 4 = Stage 4
 */

import { Weekday } from "@/lib/controllers/types";

export type DroughtStage = 0 | 1 | 2 | 3 | 4;

export const STAGE_NAMES: Record<DroughtStage, string> = {
  0: "Conservation Stage",
  1: "Stage 1",
  2: "Stage 2",
  3: "Stage 3",
  4: "Stage 4",
};

/** A daily time window when irrigation is allowed, 24h "HH:MM". */
export interface TimeWindow {
  start: string;
  end: string;
}

interface StageRule {
  /** Watering days per address last-digit (0–9). Empty = none allowed. */
  daysByDigit: Record<number, Weekday[]>;
  /** Times of day when running irrigation is allowed on an allowed day. */
  allowedWindows: TimeWindow[];
  /** Human summary for UI and reports. */
  summary: string;
}

/**
 * Austin's schedule groups addresses by even/odd last digit for
 * automatic irrigation. Spelling each digit out keeps this trivially
 * editable if the City ever moves to a true per-digit calendar.
 */
const EVEN_TWICE: Weekday[] = ["THU", "SUN"]; // even last digit, 2-day stages
const ODD_TWICE: Weekday[] = ["WED", "SAT"]; // odd last digit, 2-day stages
const EVEN_ONCE: Weekday[] = ["SUN"]; // even last digit, 1-day stages
const ODD_ONCE: Weekday[] = ["SAT"]; // odd last digit, 1-day stages

const twiceWeekly: Record<number, Weekday[]> = {
  0: EVEN_TWICE, 1: ODD_TWICE, 2: EVEN_TWICE, 3: ODD_TWICE, 4: EVEN_TWICE,
  5: ODD_TWICE, 6: EVEN_TWICE, 7: ODD_TWICE, 8: EVEN_TWICE, 9: ODD_TWICE,
};

const onceWeekly: Record<number, Weekday[]> = {
  0: EVEN_ONCE, 1: ODD_ONCE, 2: EVEN_ONCE, 3: ODD_ONCE, 4: EVEN_ONCE,
  5: ODD_ONCE, 6: EVEN_ONCE, 7: ODD_ONCE, 8: EVEN_ONCE, 9: ODD_ONCE,
};

const noWatering: Record<number, Weekday[]> = {
  0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [],
};

/** Automatic irrigation must finish by 10 a.m. or start after 7 p.m. */
const STANDARD_WINDOWS: TimeWindow[] = [
  { start: "00:00", end: "10:00" },
  { start: "19:00", end: "24:00" },
];

export const STAGE_RULES: Record<DroughtStage, StageRule> = {
  0: {
    daysByDigit: twiceWeekly,
    allowedWindows: STANDARD_WINDOWS,
    summary:
      "Automatic irrigation up to twice a week on assigned days, before 10 a.m. or after 7 p.m.",
  },
  1: {
    daysByDigit: twiceWeekly,
    allowedWindows: STANDARD_WINDOWS,
    summary:
      "Automatic irrigation up to twice a week on assigned days, before 10 a.m. or after 7 p.m.",
  },
  2: {
    daysByDigit: onceWeekly,
    allowedWindows: STANDARD_WINDOWS,
    summary:
      "Automatic irrigation once a week on the assigned day, before 10 a.m. or after 7 p.m.",
  },
  3: {
    daysByDigit: onceWeekly,
    allowedWindows: STANDARD_WINDOWS,
    summary:
      "Automatic irrigation once a week on the assigned day, before 10 a.m. or after 7 p.m.",
  },
  4: {
    daysByDigit: noWatering,
    allowedWindows: [],
    summary: "No automatic irrigation allowed.",
  },
};

/** LCRA combined-storage thresholds (acre-feet), per the product spec:
 * below 1.4M historically corresponds to Stage 1, below 900K to Stage 2.
 * Recovery to Conservation requires a sustained multi-month projection
 * above 1.4M — which is exactly why stage changes are human-confirmed. */
export const LCRA_THRESHOLDS = {
  stage1AcreFeet: 1_400_000,
  stage2AcreFeet: 900_000,
} as const;

export function suggestedStageForReading(acreFeet: number): DroughtStage {
  if (acreFeet < LCRA_THRESHOLDS.stage2AcreFeet) return 2;
  if (acreFeet < LCRA_THRESHOLDS.stage1AcreFeet) return 1;
  return 0;
}
