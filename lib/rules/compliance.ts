/**
 * Compliance evaluation: compares a controller's watering programs
 * against the confirmed drought stage's rules for the property's
 * address digit, and computes a corrected schedule plus human
 * instructions for the manual-fallback path.
 */

import { ScheduleProgram, Weekday, WEEKDAYS } from "@/lib/controllers/types";
import {
  DroughtStage,
  STAGE_NAMES,
  STAGE_RULES,
  TimeWindow,
} from "./watering-config";

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
  /** Snapshot for the audit log. */
  rulesSnapshot: {
    stage: DroughtStage;
    stageName: string;
    digit: number;
    allowedDays: Weekday[];
    allowedWindows: TimeWindow[];
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

export function evaluateCompliance(
  programs: ScheduleProgram[],
  digit: number,
  stage: DroughtStage
): ComplianceResult {
  const rule = STAGE_RULES[stage];
  const allowedDays = rule.daysByDigit[digit] ?? [];
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

    if (stage === 4 || allowedDays.length === 0) {
      if (program.days.length > 0) {
        problems.push(
          `${STAGE_NAMES[stage]} allows no automatic irrigation, but this program waters ${program.days.map(dayLabel).join(", ")}.`
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
          `Runs at ${program.startTime} for ${program.durationMinutes} min; watering must finish by 10:00 a.m. or start after 7:00 p.m.`
        );
        const picked = pickStart(program.durationMinutes, rule.allowedWindows);
        newStart = picked ?? "05:00";
        // Water in the early morning rather than at midnight.
        if (newStart === "00:00" && toMinutes("05:00") + program.durationMinutes <= toMinutes("10:00")) {
          newStart = "05:00";
        }
      }

      if (problems.length > 0) {
        fixed = { ...fixed, days: newDays, startTime: newStart };
        manual.push(
          `Change the program "${program.name}" to water only ${newDays
            .map(dayLabel)
            .join(" and ")}, starting at ${fromMinutes(toMinutes(newStart))}.`
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
    findings,
    correctedPrograms: corrected,
    manualInstructions: manual,
    rulesSnapshot: {
      stage,
      stageName: STAGE_NAMES[stage],
      digit,
      allowedDays,
      allowedWindows: rule.allowedWindows,
    },
  };
}
