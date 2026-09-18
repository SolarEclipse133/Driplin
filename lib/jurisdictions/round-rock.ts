/**
 * ============================================================
 * ROUND ROCK (City of Round Rock Utilities) — static rules
 * ============================================================
 *
 * SOURCE: City of Round Rock water conservation page,
 * https://www.roundrocktexas.gov/city-departments/utilities-and-environmental-services/water/conservation/
 *
 * Round Rock's two-day-per-week schedule is a permanent year-round
 * ordinance, not a drought-only measure; Stage 2 drops most addresses
 * to a single day. Days are assigned by the last digit of the address,
 * and irrigation is allowed before 10 a.m. or after 7 p.m.
 *
 * Stages 3 and 4 are not detailed on the city's published page, so
 * they are marked unverified — Driplin flags rather than auto-corrects
 * if one is ever confirmed active.
 */

import { Weekday } from "@/lib/controllers/types";
import { Jurisdiction, TimeWindow } from "./types";

/** Year-round baseline / Stage 1: two days per week. */
const TWO_DAY: Record<number, Weekday[]> = {
  0: ["MON", "THU"],
  1: ["WED", "SAT"],
  2: ["TUE", "FRI"],
  3: ["MON", "THU"],
  4: ["SUN", "THU"],
  5: ["WED", "SAT"],
  6: ["TUE", "FRI"],
  7: ["TUE", "FRI"],
  8: ["SUN", "THU"],
  9: ["WED", "SAT"],
};

/** Stage 2: one day per week. */
const ONE_DAY: Record<number, Weekday[]> = {
  0: ["THU"],
  1: ["WED"],
  2: ["TUE"],
  3: ["MON"],
  4: ["SUN"],
  5: ["SAT"],
  6: ["FRI"],
  7: ["FRI"],
  8: ["SUN"],
  9: ["SAT"],
};

const noWatering: Record<number, Weekday[]> = {
  0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [],
};

/** Before 10 a.m. or after 7 p.m. */
const WINDOWS: TimeWindow[] = [
  { start: "00:00", end: "10:00" },
  { start: "19:00", end: "24:00" },
];

export const ROUND_ROCK: Jurisdiction = {
  id: "round_rock",
  name: "Round Rock",
  utility: "City of Round Rock Utilities",
  officialUrl:
    "https://www.roundrocktexas.gov/city-departments/utilities-and-environmental-services/water/conservation/",
  cityNames: ["round rock"],
  stages: {
    0: {
      name: "Year-round rules",
      daysByDigit: TWO_DAY,
      allowedWindows: WINDOWS,
      summary:
        "Two watering days a week by address digit, before 10 a.m. or after 7 p.m. (permanent year-round ordinance).",
      verified: true,
    },
    1: {
      name: "Stage 1",
      daysByDigit: TWO_DAY,
      allowedWindows: WINDOWS,
      summary:
        "Two watering days a week by address digit, before 10 a.m. or after 7 p.m.",
      verified: true,
    },
    2: {
      name: "Stage 2",
      daysByDigit: ONE_DAY,
      allowedWindows: WINDOWS,
      summary:
        "One watering day a week by address digit, before 10 a.m. or after 7 p.m.",
      verified: true,
    },
    3: {
      name: "Stage 3",
      daysByDigit: ONE_DAY,
      allowedWindows: WINDOWS,
      summary: "Stage 3 restrictions — details pending verification.",
      verified: false,
      scheduleUnknown: true,
    },
    4: {
      name: "Stage 4",
      daysByDigit: noWatering,
      allowedWindows: [],
      summary: "Stage 4 restrictions — details pending verification.",
      verified: false,
      scheduleUnknown: true,
    },
  },
};
