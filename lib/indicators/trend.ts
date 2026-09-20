/**
 * Trend detection on a city's stored water-supply readings.
 *
 * WHAT THIS IS: a straight line fitted to the last few readings,
 * extended forward to guess when the supply would reach the next
 * documented trigger level if it kept falling at the same rate.
 *
 * WHAT THIS IS NOT: a forecast. It has no hydrology in it — no rain,
 * no inflows, no seasonal demand. A week of rain invalidates it
 * completely. Everything it produces is labelled an estimate, it never
 * changes a drought stage, and it never touches a customer's schedule.
 * Its only job is to say "a human may want to start watching this".
 */

import {
  DroughtStage,
  IndicatorThreshold,
  nextThresholdBelow,
} from "@/lib/jurisdictions";

export interface TrendPoint {
  value: number;
  /** ISO timestamp of the reading. */
  readAt: string;
}

export interface TrendAnalysis {
  /** True when we had enough recent readings to fit a line at all. */
  hasEnoughData: boolean;
  /** Readings actually used. */
  pointsUsed: number;
  /** Change per day from the fitted line; negative means falling. */
  slopePerDay: number;
  latestValue: number;
  /** Sustained decline: line falls AND the net change is downward. */
  declining: boolean;
  /** The next documented trigger level below the current reading. */
  nextThreshold: IndicatorThreshold | null;
  /** Estimated days until the reading would reach that level. */
  daysToThreshold: number | null;
  /** Whether that estimate lands inside the warning horizon. */
  warn: boolean;
  /** Plain-language explanation of the outcome, for logs and the UI. */
  explanation: string;
}

/** Minimum readings before we will fit a line at all. */
export const MIN_READINGS = 4;
/** Most recent readings considered (older ones age out of the trend). */
export const MAX_READINGS = 6;
/** Ignore readings older than this; a stale series is not a trend. */
export const MAX_AGE_DAYS = 45;
/** Warn when the projected crossing falls inside this many days. */
export const WARN_HORIZON_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Least-squares slope of value against days. */
function slopePerDay(points: { days: number; value: number }[]): number {
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.days, 0) / n;
  const meanY = points.reduce((s, p) => s + p.value, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.days - meanX) * (p.value - meanY);
    den += (p.days - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function analyzeTrend(
  readings: TrendPoint[],
  thresholds: IndicatorThreshold[],
  options: { now?: Date; horizonDays?: number } = {}
): TrendAnalysis {
  const now = options.now ?? new Date();
  const horizon = options.horizonDays ?? WARN_HORIZON_DAYS;

  const fresh = readings
    .filter((r) => {
      const age = (now.getTime() - new Date(r.readAt).getTime()) / MS_PER_DAY;
      return Number.isFinite(age) && age >= 0 && age <= MAX_AGE_DAYS;
    })
    .sort((a, b) => new Date(a.readAt).getTime() - new Date(b.readAt).getTime());

  const used = fresh.slice(-MAX_READINGS);

  const empty: TrendAnalysis = {
    hasEnoughData: false,
    pointsUsed: used.length,
    slopePerDay: 0,
    latestValue: used.length ? used[used.length - 1].value : 0,
    declining: false,
    nextThreshold: null,
    daysToThreshold: null,
    warn: false,
    explanation: `Need at least ${MIN_READINGS} readings from the last ${MAX_AGE_DAYS} days to judge a trend; have ${used.length}.`,
  };
  if (used.length < MIN_READINGS) return empty;

  const first = used[0];
  const latest = used[used.length - 1];
  const origin = new Date(first.readAt).getTime();
  const slope = slopePerDay(
    used.map((r) => ({
      days: (new Date(r.readAt).getTime() - origin) / MS_PER_DAY,
      value: r.value,
    }))
  );

  // Both tests must agree: the fitted line falls, and the series
  // genuinely ended lower than it started. One alone can be fooled by a
  // single outlier at either end.
  const declining = slope < 0 && latest.value < first.value;
  const next = nextThresholdBelow(thresholds, latest.value);

  if (!declining) {
    return {
      ...empty,
      hasEnoughData: true,
      slopePerDay: slope,
      latestValue: latest.value,
      nextThreshold: next,
      explanation:
        slope >= 0
          ? "Readings are level or rising over the recent window — no decline to project."
          : "Readings are not consistently lower than where the window started — no sustained decline.",
    };
  }

  if (!next) {
    return {
      ...empty,
      hasEnoughData: true,
      slopePerDay: slope,
      latestValue: latest.value,
      declining: true,
      explanation:
        "Declining, but the reading is already past every documented trigger level for this city.",
    };
  }

  const daysToThreshold = (latest.value - next.below) / -slope;
  const warn = daysToThreshold <= horizon;

  return {
    hasEnoughData: true,
    pointsUsed: used.length,
    slopePerDay: slope,
    latestValue: latest.value,
    declining: true,
    nextThreshold: next,
    daysToThreshold,
    warn,
    explanation: warn
      ? `Falling about ${Math.abs(slope).toLocaleString(undefined, { maximumFractionDigits: 2 })} per day across the last ${used.length} readings; at that rate it would reach ${next.below.toLocaleString()} in roughly ${Math.round(daysToThreshold)} days.`
      : `Falling, but at this rate the next trigger level (${next.below.toLocaleString()}) is roughly ${Math.round(daysToThreshold)} days away — outside the ${horizon}-day warning horizon.`,
  };
}

/** The stage a projected crossing would imply. */
export function projectedStage(analysis: TrendAnalysis): DroughtStage | null {
  return analysis.nextThreshold?.stage ?? null;
}
