/**
 * Compliance evaluation: compares a controller's watering programs
 * against the confirmed drought stage's rules FOR THAT PROPERTY'S
 * JURISDICTION, and computes a corrected schedule plus human
 * instructions for the manual-fallback path.
 */

import { ScheduleProgram, Weekday, WEEKDAYS } from "@/lib/controllers/types";
import type { Variance } from "./variance";
import { describeVariance } from "./variance";
import {
  DEFAULT_PROFILE,
  DroughtStage,
  PropertyProfile,
  TimeWindow,
  canJudge,
  getJurisdiction,
  resolveSchedule,
} from "@/lib/jurisdictions";

export interface ProgramFinding {
  vendorProgramId: string;
  programName: string;
  problems: string[];
}

export interface ComplianceResult {
  compliant: boolean;
  findings: ProgramFinding[];
  correctedPrograms: ScheduleProgram[];
  /** Step-by-step fixes for a human, used when we can't push remotely. */
  manualInstructions: string[];
  /**
   * False when this jurisdiction's rules for this stage have not been
   * verified against the published ordinance. The runner refuses to
   * auto-push in that case — a wrong schedule is worse than none.
   */
  rulesVerified: boolean;
  /**
   * False when we don't know this city's watering-day assignment at
   * all. No compliance judgement is made; the property is reported as
   * unverified with a pointer to the city's published schedule.
   */
  certified: boolean;
  /** Where a manager checks the real schedule when we can't certify. */
  officialUrl: string;
  /**
   * True when an approved variance widened what this property may do.
   * The verdict then rests on a document the CUSTOMER reported, not on
   * anything Driplin read from the utility, so it is labelled wherever
   * it is shown.
   */
  underVariance: boolean;
  /**
   * False when Driplin must not push a schedule to the controller.
   * A variance permits MORE watering than the city's default, and that
   * permission is a customer assertion. Writing a wider schedule onto
   * real hardware on that basis would make Driplin the cause of a
   * violation if the variance turns out not to say what was entered.
   * So under a variance Driplin judges, and stops there.
   */
  safeToPush: boolean;
  /** Snapshot for the audit log. */
  rulesSnapshot: {
    jurisdictionId: string;
    jurisdictionName: string;
    utility: string;
    stage: DroughtStage;
    stageName: string;
    digit: number;
    allowedDays: Weekday[];
    allowedWindows: TimeWindow[];
    verified: boolean;
    /** Which published table this judgement used — part of the audit trail. */
    propertyClass: string;
    irrigationType: string;
    noStreetAddress: boolean;
    /** The approval this judgement relied on, if any. */
    variance: string | null;
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function dayLabel(d: Weekday): string {
  return d[0] + d.slice(1).toLowerCase();
}

function fitsWindow(startMin: number, durationMin: number, w: TimeWindow) {
  return startMin >= toMinutes(w.start) && startMin + durationMin <= toMinutes(w.end);
}

/** Earliest allowed start time that fits the duration, or null. */
function pickStart(durationMin: number, windows: TimeWindow[]): string | null {
  for (const w of windows) {
    if (toMinutes(w.end) - toMinutes(w.start) >= durationMin) return w.start;
  }
  return null;
}

function describeWindows(windows: TimeWindow[]): string {
  if (windows.length === 0) return "no watering hours";
  return windows.map((w) => `${w.start}–${w.end}`).join(" or ");
}

export function evaluateCompliance(
  programs: ScheduleProgram[],
  digit: number,
  stage: DroughtStage,
  jurisdictionId: string,
  // Austin and Leander publish different days for commercial and
  // multifamily accounts than for residential ones, so the property's
  // own profile decides which table applies.
  profile: PropertyProfile = DEFAULT_PROFILE,
  /**
   * The variance in force, from varianceStatus(). When present it
   * replaces the city's day and hour limits for this property only.
   */
  variance: Variance | null = null
): ComplianceResult {
  const jurisdiction = getJurisdiction(jurisdictionId);
  const stageRule = jurisdiction.stages[stage];
  const schedule = resolveSchedule(stageRule, profile);
  // Everything below reads the RESOLVED schedule; only the stage's
  // name and verification status come from the rule itself.
  const rule = {
    ...stageRule,
    daysByDigit: schedule.daysByDigit,
    allowedWindows: schedule.allowedWindows,
    summary: schedule.summary,
  };

  // A variance replaces the city's limits for this property only. The
  // approval letter is the authority here, so its days and hours are
  // taken as written rather than intersected with the default table —
  // the entire point of a variance is to permit what the table forbids.
  const varianceDays =
    variance === null
      ? null
      : variance.allowedDays === "ALL"
        ? [...WEEKDAYS]
        : variance.allowedDays;
  const varianceWindows =
    variance === null
      ? null
      : variance.allowedWindows.length > 0
        ? variance.allowedWindows
        : // The approval set no hours. Judge days only rather than
          // inventing a window the utility never wrote.
          [{ start: "00:00", end: "23:59" }];

  const allowedDays = varianceDays ?? rule.daysByDigit[digit] ?? [];
  const allowedWindows = varianceWindows ?? rule.allowedWindows;

  const snapshot = {
    jurisdictionId: jurisdiction.id,
    jurisdictionName: jurisdiction.name,
    utility: jurisdiction.utility,
    stage,
    stageName: rule.name,
    digit,
    allowedDays,
    allowedWindows: allowedWindows,
    verified: rule.verified,
    propertyClass: profile.propertyClass,
    irrigationType: profile.irrigationType,
    noStreetAddress: profile.noStreetAddress === true,
    variance: variance ? describeVariance(variance) : null,
  };

  // We don't know this city's day assignment — say so plainly rather
  // than judging the schedule against a guess. That covers both a city
  // whose table we've never confirmed and a median in a city that
  // publishes no rule for areas without a street address.
  // An active variance makes the city's own table beside the point for
  // this property: the approval letter states what it may do. So a
  // property under a variance can still be judged even where Driplin
  // has not confirmed the city's day assignment.
  if (variance === null && !canJudge(stageRule, profile)) {
    return {
      compliant: false,
      certified: false,
      rulesVerified: false,
      underVariance: variance !== null,
      safeToPush: false,
      officialUrl: jurisdiction.officialUrl,
      findings: [],
      correctedPrograms: programs,
      manualInstructions: [
        profile.noStreetAddress
          ? `This meter has no street address, and ${jurisdiction.utility} publishes no watering day for such areas. Ask ${jurisdiction.utility} which day applies to it under ${rule.name} (${jurisdiction.officialUrl}), then set the controller by hand.`
          : // Say what IS known about the stage before admitting what
            // isn't. "Check with the utility" on its own gives whoever
            // has to act on this nothing to work with.
            `${rule.summary} Confirm this property's assigned day with ${jurisdiction.utility} (${jurisdiction.officialUrl}), then set the controller to match.`,
      ],
      rulesSnapshot: snapshot,
    };
  }
  const findings: ProgramFinding[] = [];
  const corrected: ScheduleProgram[] = [];
  const manual: string[] = [];

  for (const program of programs) {
    const problems: string[] = [];
    let fixed: ScheduleProgram = { ...program };

    if (!program.enabled) {
      // Disabled programs can't water; they're never a violation.
      corrected.push(fixed);
      continue;
    }

    if (allowedDays.length === 0 || allowedWindows.length === 0) {
      if (program.days.length > 0) {
        problems.push(
          `${rule.name} allows no automatic irrigation, but this program waters ${program.days.map(dayLabel).join(", ")}.`
        );
        fixed = { ...fixed, enabled: false };
        manual.push(`Disable the program "${program.name}".`);
      }
    } else {
      // Day check
      const badDays = program.days.filter((d) => !allowedDays.includes(d));
      if (badDays.length > 0) {
        problems.push(
          `Waters on ${badDays.map(dayLabel).join(", ")}, but this address may only water on ${allowedDays.map(dayLabel).join(" and ")}.`
        );
      }
      const keptDays = WEEKDAYS.filter(
        (d) => program.days.includes(d) && allowedDays.includes(d)
      );
      const newDays = keptDays.length > 0 ? keptDays : allowedDays;

      // Time-window check
      const startMin = toMinutes(program.startTime);
      const inWindow = allowedWindows.some((w) =>
        fitsWindow(startMin, program.durationMinutes, w)
      );
      let newStart = program.startTime;
      if (!inWindow) {
        problems.push(
          `Runs at ${program.startTime} for ${program.durationMinutes} min; ${jurisdiction.utility} allows watering only ${describeWindows(allowedWindows)}.`
        );
        newStart = pickStart(program.durationMinutes, allowedWindows) ?? allowedWindows[0].start;
        // Prefer an early-morning start over midnight where allowed.
        const fiveAm = toMinutes("05:00");
        const earlyOk = allowedWindows.some(
          (w) => fitsWindow(fiveAm, program.durationMinutes, w)
        );
        if (newStart === "00:00" && earlyOk) newStart = "05:00";
      }

      if (problems.length > 0) {
        fixed = { ...fixed, days: newDays, startTime: newStart };
        manual.push(
          `Change the program "${program.name}" to water only ${newDays
            .map(dayLabel)
            .join(" and ")}, starting at ${newStart}.`
        );
      }
    }

    if (problems.length > 0) {
      findings.push({
        vendorProgramId: program.vendorProgramId,
        programName: program.name,
        problems,
      });
    }
    corrected.push(fixed);
  }

  return {
    compliant: findings.length === 0,
    certified: true,
    rulesVerified: rule.verified,
    underVariance: variance !== null,
    // Never push a schedule that rests on a customer-reported approval.
    safeToPush: variance === null,
    officialUrl: jurisdiction.officialUrl,
    findings,
    correctedPrograms: corrected,
    manualInstructions: manual,
    rulesSnapshot: snapshot,
  };
}
