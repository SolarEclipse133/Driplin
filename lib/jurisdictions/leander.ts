/**
 * ============================================================
 * LEANDER (City of Leander) — TRACKED, RULES NOT CONFIRMED
 * ============================================================
 *
 * SOURCE: https://www.leandertx.gov/518/Water-Conservation
 * (City of Leander Water Conservation and Drought Contingency Plan,
 * last updated October 2023, enforced from February 2024.)
 *
 * What is consistently published: no daytime watering between 10 a.m.
 * and 7 p.m.; the designated day comes from the ending number of the
 * address where the water meter is located; tighter phases cut to one
 * day a week with midnight–7 a.m. / 7 p.m.–midnight hours.
 *
 * What could NOT be confirmed: the actual digit → day table, and which
 * phase is currently in force (published summaries disagree on whether
 * the current phase is two days by even/odd or one day by digit). So
 * every stage is marked scheduleUnknown — Driplin tracks these
 * properties and points the manager at the city's page rather than
 * guessing a watering day.
 *
 * >>> TO FINISH THIS CITY: fill in daysByDigit from the city's
 * >>> ordinance, set verified: true and drop scheduleUnknown.
 */

import { Weekday } from "@/lib/controllers/types";
import { Jurisdiction, StageRule, TimeWindow } from "./types";

const UNKNOWN_DAYS: Record<number, Weekday[]> = {
  0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [],
};

/** No irrigation between 10 a.m. and 7 p.m. */
const WINDOWS: TimeWindow[] = [
  { start: "00:00", end: "10:00" },
  { start: "19:00", end: "24:00" },
];

function pending(name: string): StageRule {
  return {
    name,
    daysByDigit: UNKNOWN_DAYS,
    allowedWindows: WINDOWS,
    summary:
      "No irrigation between 10 a.m. and 7 p.m.; watering days are assigned by the meter address. Driplin has not confirmed Leander's day-by-address table, so these schedules are flagged for manual confirmation rather than corrected automatically.",
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
    2: pending("Phase 2"),
    3: pending("Phase 3"),
    4: pending("Phase 4"),
  },
};
