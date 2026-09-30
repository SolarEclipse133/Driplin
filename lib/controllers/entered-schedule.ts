import { WEEKDAYS, type ScheduleProgram, type Weekday } from "./types";

/**
 * Validating a watering schedule somebody typed in.
 *
 * Shared by adding a manual controller and by correcting one later, so
 * the two cannot drift apart and accept different things.
 *
 * Everything Driplin says about an unconnected controller rests on this
 * being right. There is no hardware to read back from: if a typo gets
 * in, Driplin judges the wrong schedule, tells a landscaper to fix a
 * problem that does not exist, and files the result as evidence.
 */

export interface EnteredProgramInput {
  name: string;
  days: string[];
  startTime: string;
  durationMinutes: unknown;
}

export type ParseResult =
  | { ok: true; program: Omit<ScheduleProgram, "vendorProgramId"> }
  | { ok: false; error: string };

/** A day is watered at most once; order follows the week, not the form. */
function normalizeDays(days: string[]): Weekday[] {
  const given = new Set(days.map((d) => d.toUpperCase()));
  return WEEKDAYS.filter((d) => given.has(d));
}

export function parseEnteredProgram(input: EnteredProgramInput): ParseResult {
  const name = input.name.trim() || "Irrigation";

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)) {
    return {
      ok: false,
      error: "Enter the start time as HH:MM on a 24-hour clock, e.g. 05:30.",
    };
  }

  const duration = Number(input.durationMinutes);
  if (!Number.isInteger(duration) || duration < 1) {
    return { ok: false, error: "Enter how many minutes it runs for." };
  }
  // A program cannot run past the end of the day, and a run of more than
  // a few hours is a typo far more often than a real setting -- 1440
  // minutes entered instead of 14 would have Driplin reasoning about a
  // controller watering around the clock.
  if (duration > 720) {
    return {
      ok: false,
      error: "That is over 12 hours. Check the minutes — most zones run 5–60.",
    };
  }

  const days = normalizeDays(input.days);
  const unknown = input.days.filter(
    (d) => !WEEKDAYS.includes(d.toUpperCase() as Weekday)
  );
  if (unknown.length > 0) {
    return { ok: false, error: "Unrecognised day." };
  }
  if (days.length === 0) {
    return {
      ok: false,
      error:
        "Tick the days this program runs. If it is switched off, say so instead of leaving the days empty.",
    };
  }

  const [h, m] = input.startTime.split(":").map(Number);
  if (h * 60 + m + duration > 24 * 60) {
    return {
      ok: false,
      error: "That start time and duration run past midnight. Split it into two programs.",
    };
  }

  return {
    ok: true,
    program: { name, enabled: true, days, startTime: input.startTime, durationMinutes: duration },
  };
}

/** Did what somebody claims the controller is set to actually change? */
export function scheduleChanged(
  before: ScheduleProgram[],
  after: ScheduleProgram[]
): boolean {
  const shape = (p: ScheduleProgram[]) =>
    JSON.stringify(
      p.map((x) => [x.name, x.enabled, [...x.days].sort(), x.startTime, x.durationMinutes])
    );
  return shape(before) !== shape(after);
}
