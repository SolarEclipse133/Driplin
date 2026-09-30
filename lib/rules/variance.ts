import type { Weekday } from "@/lib/controllers/types";
import type { DroughtStage, TimeWindow } from "@/lib/jurisdictions";

/**
 * An approved variance from a utility's watering schedule.
 *
 * Cities do grant these. Austin Water alone offers three kinds — a new
 * xeriscape landscape, a LARGE PROPERTY ("residential or commercial
 * property that cannot be fully watered under the current schedule"),
 * and an environmental one to protect a listed species or a critical
 * environmental feature — and grants them case by case.
 *
 * That last part decides this module's whole design. The permitted
 * schedule is whatever the utility wrote on THAT property's approval
 * letter. Driplin cannot derive it from the city, the address digit or
 * the property class, so it does not try:
 *
 *   A published variance schedule DOES exist for one narrow case —
 *   landscape installed to obtain a certificate of occupancy on a newly
 *   constructed single-family home (daily for 10 days, every other day
 *   through day 20, every third day through day 30). Encoding that as
 *   "the" variance rule would be the Austin and Leander bug again:
 *   a plausible table applied to accounts it was never written for.
 *   Driplin's customers are HOAs and commercial portfolios, not
 *   single-family new builds.
 *
 * So a variance is entered from the approval document, and Driplin is
 * explicit everywhere that the utility approved it and the customer
 * reported it — Driplin did not verify it. What Driplin adds is the
 * part people actually get wrong: remembering that it expires, and
 * noticing when the drought stage has moved past the one it was granted
 * under.
 */

export type VarianceKind =
  | "new_landscape"
  | "large_property"
  | "environmental"
  | "other";

export interface Variance {
  id: string;
  kind: VarianceKind;
  /** The utility's own approval/reference number. Required: a variance
   *  nobody can look up is not evidence of anything. */
  reference: string;
  approvedOn: string;
  /** Required. A variance with no end date is an excuse, not a variance. */
  expiresOn: string;
  /** Days the approval permits. "ALL" means every day. */
  allowedDays: Weekday[] | "ALL";
  /** Hours the approval permits. Empty means the approval sets no
   *  time limit — which is rare, so it is recorded, not assumed. */
  allowedWindows: TimeWindow[];
  /** The drought stage in force when the utility approved it. */
  approvedAtStage: DroughtStage;
  notes: string | null;
}

export interface VarianceStatus {
  /** The variance in force, if any. */
  active: Variance | null;
  /** Days until it expires; negative once it has. Null with none active. */
  daysUntilExpiry: number | null;
  /** True when it lapses soon enough that someone should act now. */
  expiringSoon: boolean;
  /**
   * True when the city has moved to a stricter stage than the one the
   * variance was approved under. Austin restricts which variances stay
   * valid as stages tighten — for a while it allowed one for any new
   * landscape in Conservation Stage and Stage 1, but only for
   * drought-tolerant landscapes in Stages 2 and 3. Driplin cannot
   * adjudicate that; it can refuse to let it pass unnoticed.
   */
  stageAdvanced: boolean;
  /** Variances that have already lapsed, newest first. Kept for the log. */
  expired: Variance[];
}

export const EXPIRY_WARNING_DAYS = 14;

const DAY_MS = 86_400_000;

/** Midnight-anchored day difference, so a variance expiring today is 0. */
function daysBetween(fromISO: string, to: number): number {
  const d = Date.parse(`${fromISO.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(new Date(to).toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((d - today) / DAY_MS);
}

/**
 * Which variance, if any, governs this property right now.
 *
 * A variance takes effect on its approval date and stops on the day
 * after it expires — the last day is still covered, because that is
 * how an approval letter reads.
 */
export function varianceStatus(
  variances: Variance[],
  currentStage: DroughtStage,
  now: number = Date.now()
): VarianceStatus {
  const dated = variances.filter((v) => v.reference.trim() !== "");

  const started = (v: Variance) => daysBetween(v.approvedOn, now) <= 0;
  const remaining = (v: Variance) => daysBetween(v.expiresOn, now);

  const live = dated
    .filter((v) => started(v) && remaining(v) >= 0)
    // If a property somehow has two live variances, the most recently
    // approved is the one the utility issued last.
    .sort((a, b) => b.approvedOn.localeCompare(a.approvedOn));

  const expired = dated
    .filter((v) => remaining(v) < 0)
    .sort((a, b) => b.expiresOn.localeCompare(a.expiresOn));

  const active = live[0] ?? null;
  if (!active) {
    return {
      active: null,
      daysUntilExpiry: null,
      expiringSoon: false,
      stageAdvanced: false,
      expired,
    };
  }

  const daysUntilExpiry = remaining(active);
  return {
    active,
    daysUntilExpiry,
    expiringSoon: daysUntilExpiry <= EXPIRY_WARNING_DAYS,
    stageAdvanced: currentStage > active.approvedAtStage,
    expired,
  };
}

/** One sentence for a dashboard, a board report or an audit entry. */
export function describeVariance(v: Variance): string {
  const kind: Record<VarianceKind, string> = {
    new_landscape: "new landscape",
    large_property: "large property",
    environmental: "environmental",
    other: "approved",
  };
  const days =
    v.allowedDays === "ALL"
      ? "any day"
      : v.allowedDays.length === 0
        ? "no days"
        : v.allowedDays.map((d) => d[0] + d.slice(1).toLowerCase()).join(", ");
  const hours =
    v.allowedWindows.length === 0
      ? "no stated time limit"
      : v.allowedWindows.map((w) => `${w.start}–${w.end}`).join(" or ");
  return `${kind[v.kind]} variance ${v.reference}, permitting ${days} (${hours}), expires ${v.expiresOn.slice(0, 10)}`;
}
