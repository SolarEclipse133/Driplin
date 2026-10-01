import type { Weekday } from "@/lib/controllers/types";
import type { DroughtStage, TimeWindow } from "@/lib/jurisdictions";

/**
 * Showing the working behind a verdict.
 *
 * Every judgement already records which table it used -- the utility, the
 * stage, the account class, the irrigation type, the days and hours, and
 * whether Driplin has confirmed those rules against the published
 * ordinance. None of it was ever shown to anybody.
 *
 * So a manager saw "Violation" and not the basis for it. They could not
 * check it, could not explain it to a board, and could not catch Driplin
 * being wrong -- which, given that both the Austin and Leander tables
 * shipped wrong for commercial accounts, is a thing that has happened.
 *
 * A compliance product that will not show its reasoning is asking to be
 * taken on faith, which is the opposite of what it is sold for.
 */

export interface RulesSnapshot {
  jurisdictionName: string;
  utility: string;
  stage: DroughtStage;
  stageName: string;
  digit: number;
  allowedDays: Weekday[];
  allowedWindows: TimeWindow[];
  verified: boolean;
  propertyClass: string;
  irrigationType: string;
  noStreetAddress: boolean;
  /** Set when an approved variance replaced the city's own table. */
  variance?: string | null;
}

export interface Explanation {
  /** One line: what this property was measured against. */
  headline: string;
  /** The specific facts, in the order someone would check them. */
  points: string[];
  /**
   * Set when the judgement rests on something Driplin has not confirmed
   * itself. Shown as a caveat rather than buried.
   */
  caveat: string | null;
}

const DAY_NAMES: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

function listDays(days: Weekday[]): string {
  if (days.length === 0) return "no days";
  if (days.length === 7) return "any day";
  const named = days.map((d) => DAY_NAMES[d] ?? d);
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

function listWindows(windows: TimeWindow[]): string {
  if (windows.length === 0) return "no permitted hours";
  return windows.map((w) => `${w.start}–${w.end}`).join(", or ");
}

function describeTable(snapshot: RulesSnapshot): string {
  const cls =
    snapshot.propertyClass === "residential" ? "residential" : "commercial";
  const irrigation =
    snapshot.irrigationType === "drip_or_hose"
      ? "drip or hose-end"
      : "automatic in-ground";
  return `${cls} accounts with ${irrigation} irrigation`;
}

export function explainVerdict(snapshot: RulesSnapshot): Explanation {
  const points: string[] = [];

  if (snapshot.variance) {
    // The approval replaces the city's table entirely, so lead with it
    // rather than listing rules that did not apply.
    points.push(`Judged against an approved variance: ${snapshot.variance}.`);
    points.push(
      `${snapshot.utility} granted it and your team recorded it. Driplin has not verified it with ${snapshot.utility}.`
    );
    points.push(
      `Permitted while it applies: ${listDays(snapshot.allowedDays)}, ${listWindows(snapshot.allowedWindows)}.`
    );
    return {
      headline: `Measured against this property's variance, not ${snapshot.utility}'s standard ${snapshot.stageName} schedule.`,
      points,
      caveat: `A variance is a document your team entered. If it does not say what was recorded, this verdict is wrong — and Driplin will not change the controller automatically while one applies.`,
    };
  }

  points.push(
    `${snapshot.utility} is in ${snapshot.stageName} for ${snapshot.jurisdictionName}.`
  );
  // The table is the part that was wrong in both shipped bugs, so it is
  // named explicitly rather than assumed.
  points.push(
    `This property is treated as one of ${describeTable(snapshot)}.`
  );
  points.push(
    snapshot.noStreetAddress
      ? `It has no street address, so the rule for such meters applies rather than an address digit.`
      : `Its street number ends in ${snapshot.digit}, which is what ${snapshot.utility} assigns the watering day from.`
  );
  points.push(
    `That permits watering on ${listDays(snapshot.allowedDays)}, ${listWindows(snapshot.allowedWindows)}.`
  );

  return {
    headline: `Measured against ${snapshot.utility}'s published ${snapshot.stageName} schedule for ${describeTable(snapshot)}.`,
    points,
    caveat: snapshot.verified
      ? null
      : `Driplin has not confirmed ${snapshot.utility}'s published rules for ${snapshot.stageName} against their own notice, so it reports rather than judges, and will not change any controller on this basis.`,
  };
}
