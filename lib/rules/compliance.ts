/**
 * Compliance evaluation: compares a controller's watering programs
 * against the confirmed drought stage's rules FOR THAT PROPERTY'S
 * JURISDICTION, and computes a corrected schedule plus human
 * instructions for the manual-fallback path.
 */

import { ScheduleProgram, Weekday, WEEKDAYS } from "@/lib/controllers/types";
import {
  DEFAULT_PROFILE,
  DroughtStage,
  PropertyProfile,
  TimeWindow,
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
  profile: PropertyProfile = DEFAULT_PROFILE
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
  const allowedDays = rule.daysByDigit[digit] ?? [];

  const snapshot = {
    jurisdictionId: jurisdiction.id,
    jurisdictionName: jurisdiction.name,
    utility: jurisdiction.utility,
    stage,
    stageName: rule.name,
    digit,
    allowedDays,
    allowedWindows: rule.allowedWindows,
    verified: rule.verified,
    propertyClass: profile.propertyClass,
    irrigationType: profile.irrigationType,
  };

  // We don't know this city's day assignment — say so plainly rather
  // than judging the schedule against a guess.
  if (rule.scheduleUnknown) {
    return {
      compliant: false,
      certified: false,
      rulesVerified: false,
      officialUrl: jurisdiction.officialUrl,
      findings: [],
      correctedPrograms: programs,
      manualInstructions: [
        `Check this property's assigned watering day and hours for ${rule.name} at ${jurisdiction.officialUrl}, then confirm the controller matches.`,
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

    if (allowedDays.length === 0 || rule.allowedWindows.length === 0) {
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
      const inWindow = rule.allowedWindows.some((w) =>
        fitsWindow(startMin, program.durationMinutes, w)
      );
      let newStart = program.startTime;
      if (!inWindow) {
        problems.push(
          `Runs at ${program.startTime} for ${program.durationMinutes} min; ${jurisdiction.utility} allows watering only ${describeWindows(rule.allowedWindows)}.`
        );
        newStart = pickStart(program.durationMinutes, rule.allowedWindows) ?? rule.allowedWindows[0].start;
        // Prefer an early-morning start over midnight where allowed.
        const fiveAm = toMinutes("05:00");
        const earlyOk = rule.allowedWindows.some(
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
    officialUrl: jurisdiction.officialUrl,
    findings,
    correctedPrograms: corrected,
    manualInstructions: manual,
    rulesSnapshot: snapshot,
  };
}
