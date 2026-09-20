/**
 * ============================================================
 * AUSTIN (Austin Water) — static watering rules
 * ============================================================
 *
 * SOURCE: City of Austin Drought Contingency Plan (council-approved,
 * last updated November 2024); Austin City Code Chapter 6-4; Austin
 * Water's "Your Watering Schedule" page:
 * https://www.austintexas.gov/department/water-conservation
 *
 * Austin assigns automatic-irrigation watering days by the LAST DIGIT
 * of the street address number. Hardcoded on purpose: these change on
 * the order of YEARS via council action, so fetching them live would
 * add fragility for no benefit.
 *
 * >>> TO EDIT: change the day lists / windows below, then redeploy. <<<
 *
 * Stages 3 and 4 are marked verified: false — their day/time details
 * have not been confirmed against the published ordinance, so Driplin
 * will flag rather than auto-correct if one is ever confirmed active.
 */

import { Weekday } from "@/lib/controllers/types";
import { fetchLcraCombinedStorage } from "@/lib/indicators/lcra";
import {
  IndicatorThreshold,
  Jurisdiction,
  stageFromThresholds,
  TimeWindow,
} from "./types";

const EVEN_TWICE: Weekday[] = ["THU", "SUN"];
const ODD_TWICE: Weekday[] = ["WED", "SAT"];
const EVEN_ONCE: Weekday[] = ["SUN"];
const ODD_ONCE: Weekday[] = ["SAT"];

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

/**
 * LCRA combined-storage thresholds (acre-feet): below 1.4M historically
 * corresponds to Stage 1, below 900K to Stage 2.
 */
export const LCRA_THRESHOLDS: IndicatorThreshold[] = [
  { stage: 2, below: 900_000 },
  { stage: 1, below: 1_400_000 },
];

export const AUSTIN: Jurisdiction = {
  id: "austin",
  name: "Austin",
  utility: "Austin Water",
  officialUrl: "https://www.austintexas.gov/department/water-conservation",
  cityNames: ["austin"],
  stages: {
    0: {
      name: "Conservation Stage",
      daysByDigit: twiceWeekly,
      allowedWindows: STANDARD_WINDOWS,
      summary:
        "Automatic irrigation up to twice a week on assigned days, before 10 a.m. or after 7 p.m.",
      verified: true,
    },
    1: {
      name: "Stage 1",
      daysByDigit: twiceWeekly,
      allowedWindows: STANDARD_WINDOWS,
      summary:
        "Automatic irrigation up to twice a week on assigned days, before 10 a.m. or after 7 p.m.",
      verified: true,
    },
    2: {
      name: "Stage 2",
      daysByDigit: onceWeekly,
      allowedWindows: STANDARD_WINDOWS,
      summary:
        "Automatic irrigation once a week on the assigned day, before 10 a.m. or after 7 p.m.",
      verified: true,
    },
    3: {
      name: "Stage 3",
      daysByDigit: onceWeekly,
      allowedWindows: STANDARD_WINDOWS,
      summary:
        "Automatic irrigation once a week on the assigned day, before 10 a.m. or after 7 p.m. (details pending verification).",
      verified: false,
    },
    4: {
      name: "Stage 4",
      daysByDigit: noWatering,
      allowedWindows: [],
      summary: "No automatic irrigation allowed (details pending verification).",
      verified: false,
    },
  },
  indicator: {
    id: "lcra_combined_storage",
    label: "LCRA combined storage (Lakes Travis + Buchanan)",
    unit: "acre-feet",
    sourceUrl: "https://hydrometdata.lcra.org/",
    thresholds: LCRA_THRESHOLDS,
    suggestStage: (value: number) => stageFromThresholds(LCRA_THRESHOLDS, value),
    decliningVerb: "declining toward",
    fetchReading: fetchLcraCombinedStorage,
    caveat:
      "Recovery to Conservation Stage requires a sustained multi-month projected recovery above 1.4 million acre-feet, not a single day crossing back over the line.",
  },
};
