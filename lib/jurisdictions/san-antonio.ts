/**
 * ============================================================
 * SAN ANTONIO (San Antonio Water System) — static watering rules
 * ============================================================
 *
 * SOURCE: SAWS drought restrictions pages
 *   https://www.saws.org/conservation/drought-restrictions/
 *   .../stage-1/  .../stage-2/  .../stage-3/
 *
 * SAWS assigns ONE watering day per week by the LAST DIGIT of the
 * street address, and that day does not change between stages — only
 * the allowed hours tighten:
 *   0 or 1 → Monday      2 or 3 → Tuesday     4 or 5 → Wednesday
 *   6 or 7 → Thursday    8 or 9 → Friday
 * (Addresses without a street number, e.g. medians, water Wednesday —
 * not modeled here because Driplin properties always have an address.)
 *
 * Stage 4 is marked verified: false — its watering-day/hour details
 * have not been confirmed against SAWS' published ordinance, so
 * Driplin flags for human review rather than auto-correcting if it is
 * ever confirmed active.
 *
 * Stage triggers use the Edwards Aquifer J-17 index well 10-day
 * rolling average. Note that the EAA declaring a stage does NOT mean
 * SAWS has: SAWS customers have remained in Stage 2 through an EAA
 * Stage 3 announcement. That gap is exactly why Driplin requires a
 * human to confirm the stage.
 */

import { Weekday } from "@/lib/controllers/types";
import { fetchJ17TenDayAverage } from "@/lib/indicators/j17";
import {
  IndicatorThreshold,
  Jurisdiction,
  stageFromThresholds,
  TimeWindow,
} from "./types";

const DAY_BY_DIGIT: Record<number, Weekday[]> = {
  0: ["MON"], 1: ["MON"],
  2: ["TUE"], 3: ["TUE"],
  4: ["WED"], 5: ["WED"],
  6: ["THU"], 7: ["THU"],
  8: ["FRI"], 9: ["FRI"],
};

/** Stage 1: midnight–10 a.m. and 9 p.m.–midnight. */
const STAGE_1_WINDOWS: TimeWindow[] = [
  { start: "00:00", end: "10:00" },
  { start: "21:00", end: "24:00" },
];

/** Stage 2 and 3: 5–10 a.m. and 9 p.m.–midnight. */
const STAGE_2_WINDOWS: TimeWindow[] = [
  { start: "05:00", end: "10:00" },
  { start: "21:00", end: "24:00" },
];

const noWatering: Record<number, Weekday[]> = {
  0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [],
};

/**
 * J-17 index well 10-day average thresholds, feet above mean sea level.
 * Below 660 → Stage 1, below 650 → Stage 2, below 640 → Stage 3.
 */
export const J17_THRESHOLDS: IndicatorThreshold[] = [
  { stage: 3, below: 640 },
  { stage: 2, below: 650 },
  { stage: 1, below: 660 },
];

export const SAN_ANTONIO: Jurisdiction = {
  id: "san_antonio",
  name: "San Antonio",
  utility: "San Antonio Water System (SAWS)",
  officialUrl: "https://www.saws.org/conservation/drought-restrictions/",
  cityNames: ["san antonio"],
  stages: {
    0: {
      name: "No restrictions",
      daysByDigit: DAY_BY_DIGIT,
      allowedWindows: STAGE_1_WINDOWS,
      summary:
        "Landscape watering on your assigned day by address digit, overnight hours.",
      verified: true,
    },
    1: {
      name: "Stage 1",
      daysByDigit: DAY_BY_DIGIT,
      allowedWindows: STAGE_1_WINDOWS,
      summary:
        "Irrigation once a week on your assigned day, midnight–10 a.m. or 9 p.m.–midnight.",
      verified: true,
    },
    2: {
      name: "Stage 2",
      daysByDigit: DAY_BY_DIGIT,
      allowedWindows: STAGE_2_WINDOWS,
      summary:
        "Irrigation once a week on your assigned day, 5–10 a.m. or 9 p.m.–midnight.",
      verified: true,
    },
    3: {
      name: "Stage 3",
      daysByDigit: DAY_BY_DIGIT,
      allowedWindows: STAGE_2_WINDOWS,
      summary:
        "Irrigation once a week on your assigned day, 5–10 a.m. or 9 p.m.–midnight (Stage 3 adds surcharges but keeps the Stage 2 watering schedule).",
      verified: true,
    },
    4: {
      name: "Stage 4",
      daysByDigit: noWatering,
      allowedWindows: [],
      summary:
        "Stage 4 restrictions apply — schedule details pending verification against the SAWS ordinance.",
      verified: false,
    },
  },
  indicator: {
    id: "eaa_j17_ten_day_average",
    label: "Edwards Aquifer J-17 index well (10-day average)",
    unit: "ft above mean sea level",
    sourceUrl: "https://www.edwardsaquifer.org/",
    thresholds: J17_THRESHOLDS,
    suggestStage: (value: number) => stageFromThresholds(J17_THRESHOLDS, value),
    decliningVerb: "dropping toward",
    fetchReading: fetchJ17TenDayAverage,
    caveat:
      "The Edwards Aquifer Authority's own stage declarations are separate from SAWS customer restrictions — SAWS customers have stayed in Stage 2 through an EAA Stage 3 announcement. Confirm against the SAWS drought page before changing the stage.",
  },
};
