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

/**
 * Austin publishes FOUR different schedules, split by who holds the
 * account and what kind of irrigation is on it. Getting this wrong is
 * not a rounding error: a commercial account told to water Sunday when
 * the city says Tuesday is in violation on Driplin's instruction.
 *
 * Source: Austin Water, "Find Your Watering Day" (see officialUrl).
 *   Residential  · automatic/manual : even THU, odd WED      (1 day)
 *   Residential  · drip/hose-end    : even THU+SUN, odd WED+SAT (2 days)
 *   Commercial & multifamily · automatic/manual : even TUE, odd FRI (1 day)
 *   Commercial & multifamily · drip/hose-end    : TUE+FRI for all   (2 days)
 *
 * Note the commercial split is by EVEN/ODD, not by the specific digit —
 * we still key by digit so every city shares one shape.
 */
function byParity(even: Weekday[], odd: Weekday[]): Record<number, Weekday[]> {
  return {
    0: even, 1: odd, 2: even, 3: odd, 4: even,
    5: odd, 6: even, 7: odd, 8: even, 9: odd,
  };
}

function everyDigit(days: Weekday[]): Record<number, Weekday[]> {
  return {
    0: days, 1: days, 2: days, 3: days, 4: days,
    5: days, 6: days, 7: days, 8: days, 9: days,
  };
}

const RESIDENTIAL_AUTOMATIC = byParity(["THU"], ["WED"]);
const RESIDENTIAL_DRIP = byParity(["THU", "SUN"], ["WED", "SAT"]);
const COMMERCIAL_AUTOMATIC = byParity(["TUE"], ["FRI"]);
const COMMERCIAL_DRIP = everyDigit(["TUE", "FRI"]);

const noWatering = everyDigit([]);

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
      // Base = what Driplin's own customers almost always are. Every
      // combination is declared below, so this is only a fallback.
      daysByDigit: COMMERCIAL_AUTOMATIC,
      allowedWindows: STANDARD_WINDOWS,
      summary:
        "Automatic irrigation once a week on the assigned day, before 10 a.m. or after 7 p.m.",
      variants: {
        "residential:automatic": {
          daysByDigit: RESIDENTIAL_AUTOMATIC,
          allowedWindows: STANDARD_WINDOWS,
          summary:
            "Residential automatic irrigation once a week — Thursday for even addresses, Wednesday for odd — before 10 a.m. or after 7 p.m.",
        },
        "residential:drip_or_hose": {
          daysByDigit: RESIDENTIAL_DRIP,
          allowedWindows: STANDARD_WINDOWS,
          summary:
            "Residential drip and hose-end watering twice a week — Thursday and Sunday for even addresses, Wednesday and Saturday for odd — before 10 a.m. or after 7 p.m.",
        },
        "commercial:automatic": {
          daysByDigit: COMMERCIAL_AUTOMATIC,
          allowedWindows: STANDARD_WINDOWS,
          summary:
            "Commercial and multifamily automatic irrigation once a week — Tuesday for even addresses, Friday for odd — before 10 a.m. or after 7 p.m.",
        },
        "commercial:drip_or_hose": {
          daysByDigit: COMMERCIAL_DRIP,
          allowedWindows: STANDARD_WINDOWS,
          summary:
            "Commercial and multifamily drip and hose-end watering on Tuesday and Friday, before 10 a.m. or after 7 p.m.",
        },
      },
      verified: true,
    },
    1: {
      name: "Stage 1",
      daysByDigit: COMMERCIAL_AUTOMATIC,
      allowedWindows: STANDARD_WINDOWS,
      summary:
        "Watering days are assigned by address, but Austin publishes its day tables only for the stage currently in force. Driplin flags these properties for review instead of correcting them.",
      verified: false,
      scheduleUnknown: true,
    },
    2: {
      name: "Stage 2",
      daysByDigit: COMMERCIAL_AUTOMATIC,
      // When Austin was last in Stage 2 the morning window was cut to
      // "before 5 a.m." — recorded here, but the day table is not
      // published while the city is in Conservation Stage.
      allowedWindows: [
        { start: "00:00", end: "05:00" },
        { start: "19:00", end: "24:00" },
      ],
      summary:
        "Once a week on the assigned day, before 5 a.m. or after 7 p.m. Driplin has not been able to confirm Austin's Stage 2 day table, so these properties are flagged for review rather than corrected.",
      verified: false,
      scheduleUnknown: true,
    },
    3: {
      name: "Stage 3",
      daysByDigit: COMMERCIAL_AUTOMATIC,
      allowedWindows: STANDARD_WINDOWS,
      summary:
        "Austin does not publish its Stage 3 day table while the city is in Conservation Stage. Driplin flags these properties for review rather than correcting them.",
      verified: false,
      scheduleUnknown: true,
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
