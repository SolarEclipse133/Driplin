/**
 * ============================================================
 * GEORGETOWN (Georgetown Water Utility) — static rules
 * ============================================================
 *
 * SOURCE: Georgetown Water Utility watering schedule,
 * https://georgetowntexas.gov/utilities/water
 *
 * Days by last digit of the street address:
 *   1, 5, 9       → Tuesday and/or Friday
 *   2, 4, 6, 8    → Wednesday and/or Saturday
 *   0, 3, 7       → Thursday and/or Sunday
 * No watering any time on MONDAY, and no automated irrigation between
 * 9 a.m. and 7 p.m. any day (so: midnight–9 a.m. and 7 p.m.–midnight).
 *
 * The utility publishes the two-day (Stage 1) schedule above. Stage 2
 * and beyond cut to fewer days, but which day is kept is not stated on
 * the public page, so those stages are marked unverified and route to
 * manual review instead of an automatic correction.
 */

import { Weekday } from "@/lib/controllers/types";
import { Jurisdiction, TimeWindow } from "./types";

const TWO_DAY: Record<number, Weekday[]> = {
  0: ["THU", "SUN"],
  1: ["TUE", "FRI"],
  2: ["WED", "SAT"],
  3: ["THU", "SUN"],
  4: ["WED", "SAT"],
  5: ["TUE", "FRI"],
  6: ["WED", "SAT"],
  7: ["THU", "SUN"],
  8: ["WED", "SAT"],
  9: ["TUE", "FRI"],
};

const noWatering: Record<number, Weekday[]> = {
  0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [],
};

/** Midnight–9 a.m. and 7 p.m.–midnight. */
const WINDOWS: TimeWindow[] = [
  { start: "00:00", end: "09:00" },
  { start: "19:00", end: "24:00" },
];

export const GEORGETOWN: Jurisdiction = {
  id: "georgetown",
  name: "Georgetown",
  utility: "Georgetown Water Utility",
  officialUrl: "https://georgetowntexas.gov/utilities/water",
  cityNames: ["georgetown"],
  stages: {
    0: {
      name: "Standard schedule",
      daysByDigit: TWO_DAY,
      allowedWindows: WINDOWS,
      summary:
        "Two watering days a week by address digit, midnight–9 a.m. or 7 p.m.–midnight. No watering on Mondays.",
      verified: true,
    },
    1: {
      name: "Stage 1",
      daysByDigit: TWO_DAY,
      allowedWindows: WINDOWS,
      summary:
        "Two watering days a week by address digit, midnight–9 a.m. or 7 p.m.–midnight. No watering on Mondays.",
      verified: true,
    },
    2: {
      name: "Stage 2",
      daysByDigit: TWO_DAY,
      allowedWindows: WINDOWS,
      summary:
        "One watering day a week — which day is kept is not published online, so Driplin flags these properties for manual confirmation.",
      verified: false,
      scheduleUnknown: true,
    },
    3: {
      name: "Stage 3",
      daysByDigit: noWatering,
      allowedWindows: [],
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
