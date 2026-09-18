/**
 * ============================================================
 * CEDAR PARK (City of Cedar Park) — TRACKED, RULES NOT CONFIRMED
 * ============================================================
 *
 * SOURCE: https://www.cedarparktexas.gov/1209/Watering-Schedule
 *
 * What the city publishes in text: irrigation is allowed only before
 * 10 a.m. or after 7 p.m. on your designated day; under Stage 3 it is
 * one day per week, commercial/HOA-owned addresses water on Tuesday,
 * and nobody waters Monday or Friday.
 *
 * What is NOT machine-readable: the address-digit → day table, which
 * Cedar Park publishes only as an image. Rather than guess a day and
 * risk pushing a wrong schedule to a customer's controller, every
 * stage here is marked scheduleUnknown: Driplin tracks the property,
 * keeps its history and reports, and tells the manager to confirm the
 * day against the city's page.
 *
 * >>> TO FINISH THIS CITY: fill in daysByDigit from the city's
 * >>> published schedule, set verified: true and drop
 * >>> scheduleUnknown. Nothing else needs to change.
 */

import { Weekday } from "@/lib/controllers/types";
import { Jurisdiction, StageRule, TimeWindow } from "./types";

const UNKNOWN_DAYS: Record<number, Weekday[]> = {
  0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [],
};

/** Before 10 a.m. or after 7 p.m. (this part IS published in text). */
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
      "Watering before 10 a.m. or after 7 p.m. on your designated day. Cedar Park publishes its day-by-address schedule as an image, so Driplin does not judge these schedules automatically — confirm the day with the city.",
    verified: false,
    scheduleUnknown: true,
  };
}

export const CEDAR_PARK: Jurisdiction = {
  id: "cedar_park",
  name: "Cedar Park",
  utility: "City of Cedar Park",
  officialUrl: "https://www.cedarparktexas.gov/1209/Watering-Schedule",
  cityNames: ["cedar park"],
  stages: {
    0: pending("Standard schedule"),
    1: pending("Stage 1"),
    2: pending("Stage 2"),
    3: pending("Stage 3"),
    4: pending("Stage 4"),
  },
};
