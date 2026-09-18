/**
 * ============================================================
 * LEANDER (City of Leander) — static watering rules
 * ============================================================
 *
 * SOURCE: City of Leander, "Phase 2 water conservation in effect",
 * https://www.leandertx.gov/716/Phase-2-water-conservation-in-effect
 * and https://www.leandertx.gov/518/Water-Conservation
 * (Water Conservation and Drought Contingency Plan, updated October
 * 2023, enforced from February 2024.)
 *
 * PHASE 2 — the phase Leander publishes as currently in effect — is
 * one watering day per week by the last digit of the address where the
 * water meter is located, midnight–7 a.m. or 7 p.m.–midnight. The same
 * schedule applies to residential and commercial properties:
 *   2, 4 → Monday     1, 5 → Tuesday    6 → Wednesday   0 → Thursday
 *   9 → Friday        8 → Saturday      3, 7 → Sunday
 *
 * The city does not publish equivalent day tables for its other
 * phases, so those remain unconfirmed: Driplin tracks properties in
 * them but makes no compliance judgement until the phase is Phase 2
 * or the missing tables are filled in here.
 */

import { Weekday } from "@/lib/controllers/types";
import { Jurisdiction, StageRule, TimeWindow } from "./types";

/** Phase 2: one day a week by address digit. */
const PHASE_2_DAYS: Record<number, Weekday[]> = {
  0: ["THU"],
  1: ["TUE"],
  2: ["MON"],
  3: ["SUN"],
  4: ["MON"],
  5: ["TUE"],
  6: ["WED"],
  7: ["SUN"],
  8: ["SAT"],
  9: ["FRI"],
};

const UNKNOWN_DAYS: Record<number, Weekday[]> = {
  0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [],
};

/** Phase 2 hours: midnight–7 a.m. or 7 p.m.–midnight. */
const PHASE_2_WINDOWS: TimeWindow[] = [
  { start: "00:00", end: "07:00" },
  { start: "19:00", end: "24:00" },
];

/** Other phases publish only "no watering 10 a.m.–7 p.m.". */
const GENERAL_WINDOWS: TimeWindow[] = [
  { start: "00:00", end: "10:00" },
  { start: "19:00", end: "24:00" },
];

function pending(name: string): StageRule {
  return {
    name,
    daysByDigit: UNKNOWN_DAYS,
    allowedWindows: GENERAL_WINDOWS,
    summary:
      "No irrigation between 10 a.m. and 7 p.m.; watering days are assigned by the meter address. Leander publishes a day-by-address table only for Phase 2, so Driplin flags other phases for manual confirmation rather than correcting them automatically.",
    verified: false,
    scheduleUnknown: true,
  };
}

export const LEANDER: Jurisdiction = {
  id: "leander",
  name: "Leander",
  utility: "City of Leander",
  officialUrl: "https://www.leandertx.gov/518/Water-Conservation",
  cityNames: ["leander"],
  stages: {
    0: pending("Standard schedule"),
    1: pending("Phase 1"),
    2: {
      name: "Phase 2",
      daysByDigit: PHASE_2_DAYS,
      allowedWindows: PHASE_2_WINDOWS,
      summary:
        "One watering day a week by address digit, midnight–7 a.m. or 7 p.m.–midnight.",
      verified: true,
    },
    3: pending("Phase 3"),
    4: pending("Phase 4"),
  },
};
