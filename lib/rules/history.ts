import { centralCalendarDate } from "@/lib/dates/central";

/**
 * Compliance over time, told honestly.
 *
 * Every view in Driplin is "right now" plus a 90-day PDF. There is no
 * history — no answer to "how have we done this season", which is the
 * question at renewal and the one a board asks before approving next
 * year's budget.
 *
 * The trap in building it is the headline percentage. "94% compliant"
 * sounds like an answer, and it is a lie whenever Driplin was not looking:
 * a night the job never ran, a controller it could not read, a property
 * added last week. Those days are not compliant days. They are days
 * nobody knows about, and quietly counting them as either is how a
 * compliance record stops being evidence.
 *
 * So a day is one of three things, and the days nobody knows about are
 * reported as loudly as the rest.
 */

export type DayStatus = "compliant" | "violation" | "unchecked";

export interface HistoryEvent {
  created_at: string;
  /** compliance_events.type */
  type: string;
}

export interface ComplianceHistory {
  /** Oldest first, one entry per calendar day in the period. */
  days: { date: string; status: DayStatus }[];
  totalDays: number;
  compliantDays: number;
  violationDays: number;
  uncheckedDays: number;
  /** Longest run of consecutive compliant days. */
  longestCompliantRun: number;
  /** Compliant days up to and including the most recent one. */
  currentRun: number;
  /**
   * Compliant days as a share of days actually CHECKED, or null when too
   * little of the period was covered to quote a number at all.
   */
  compliantShare: number | null;
  /** How much of the period Driplin actually looked at. */
  coverage: number;
}

/** Below this, a percentage would flatter a record full of holes. */
export const MIN_COVERAGE_TO_QUOTE = 0.6;

/** Events that mean something was wrong that day. */
const VIOLATION_TYPES = [
  "violation",
  "push_failed",
  "work_order_stale",
  "controller_unreadable",
] as const;

/**
 * Events that prove Driplin looked at all.
 *
 * Every violation type is one by construction, rather than by being listed
 * twice: a day can never be "a violation but also nobody checked", and
 * keeping two hand-written lists is how that contradiction gets in.
 */
const CHECK_TYPES = new Set<string>([
  ...VIOLATION_TYPES,
  "check",
  "auto_correction",
  "manual_fix_confirmed",
]);

const VIOLATIONS = new Set<string>(VIOLATION_TYPES);

function eachDay(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${fromISO}T12:00:00Z`);
  const end = Date.parse(`${toISO}T12:00:00Z`);
  for (let t = start; t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function complianceHistory(
  events: HistoryEvent[],
  fromDate: string,
  toDate: string
): ComplianceHistory {
  // Group by the Central calendar day, because that is the day the rules
  // are written on and the day a person means.
  const checked = new Set<string>();
  const breached = new Set<string>();

  for (const e of events) {
    const day = centralCalendarDate(Date.parse(e.created_at));
    if (CHECK_TYPES.has(e.type)) checked.add(day);
    if (VIOLATIONS.has(e.type)) breached.add(day);
  }

  const days = eachDay(fromDate, toDate).map((date) => ({
    date,
    status: !checked.has(date)
      ? ("unchecked" as const)
      : breached.has(date)
        ? ("violation" as const)
        : ("compliant" as const),
  }));

  let longestCompliantRun = 0;
  let run = 0;
  for (const d of days) {
    if (d.status === "compliant") {
      run += 1;
      longestCompliantRun = Math.max(longestCompliantRun, run);
    } else {
      // An unchecked day breaks a streak. Claiming an unbroken run across
      // days nobody looked at is the whole failure this guards against.
      run = 0;
    }
  }

  let currentRun = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].status !== "compliant") break;
    currentRun += 1;
  }

  const compliantDays = days.filter((d) => d.status === "compliant").length;
  const violationDays = days.filter((d) => d.status === "violation").length;
  const uncheckedDays = days.filter((d) => d.status === "unchecked").length;
  const checkedDays = compliantDays + violationDays;
  const coverage = days.length === 0 ? 0 : checkedDays / days.length;

  return {
    days,
    totalDays: days.length,
    compliantDays,
    violationDays,
    uncheckedDays,
    longestCompliantRun,
    currentRun,
    compliantShare:
      coverage >= MIN_COVERAGE_TO_QUOTE && checkedDays > 0
        ? compliantDays / checkedDays
        : null,
    coverage,
  };
}

/** One sentence for a dashboard or a board report. */
export function describeHistory(h: ComplianceHistory): string {
  if (h.totalDays === 0) return "No period to report on.";
  if (h.coverage === 0) {
    return `Driplin has no record for these ${h.totalDays} days. Nothing was checked, so nothing can be claimed.`;
  }

  const pct =
    h.compliantShare === null
      ? null
      : `${Math.round(h.compliantShare * 100)}%`;

  const headline =
    pct === null
      ? `Driplin checked ${h.compliantDays + h.violationDays} of these ${h.totalDays} days — too few to put a figure on.`
      : `Compliant on ${pct} of the ${h.compliantDays + h.violationDays} days Driplin checked.`;

  const gap =
    h.uncheckedDays > 0
      ? ` ${h.uncheckedDays} day${h.uncheckedDays === 1 ? "" : "s"} went unchecked and ${h.uncheckedDays === 1 ? "is" : "are"} counted as neither.`
      : " Every day in the period was checked.";

  return headline + gap;
}
