import { describe, expect, it } from "vitest";
import { analyzeTrend, MIN_READINGS, projectedStage } from "./trend";
import { LCRA_THRESHOLDS } from "@/lib/jurisdictions/austin";

/**
 * Trend projection behind the early-warning notice.
 *
 * This is the only place Driplin predicts anything, and it is labelled
 * an estimate wherever it appears. The discipline that keeps it honest
 * is the two-test rule: the fitted line must fall AND the series must
 * genuinely have ended lower than it started. Either alone can be
 * fooled by a single outlier at one end.
 *
 * LCRA thresholds: below 1,400,000 acre-feet is Stage 1, below 900,000
 * is Stage 2.
 */

const DAY = 86_400_000;
const NOW = new Date("2026-09-30T12:00:00Z");

/** Readings ending today, oldest first, one per day. */
const series = (values: number[]) =>
  values.map((value, i) => ({
    value,
    readAt: new Date(NOW.getTime() - (values.length - 1 - i) * DAY).toISOString(),
  }));

const analyze = (values: number[]) =>
  analyzeTrend(series(values), LCRA_THRESHOLDS, { now: NOW });

describe("needs enough recent data", () => {
  it(`will not fit a line below ${MIN_READINGS} readings`, () => {
    const analysis = analyze([1_500_000, 1_490_000, 1_480_000]);
    expect(analysis.hasEnoughData).toBe(false);
    expect(analysis.warn).toBe(false);
    expect(analysis.explanation).toMatch(/at least 4 readings/);
  });

  it("ages out readings older than the freshness window", () => {
    const stale = [
      { value: 1_500_000, readAt: new Date(NOW.getTime() - 200 * DAY).toISOString() },
      ...series([1_400_000, 1_390_000, 1_380_000]),
    ];
    expect(analyzeTrend(stale, LCRA_THRESHOLDS, { now: NOW }).pointsUsed).toBe(3);
  });
});

describe("warns only on a genuine decline toward a threshold", () => {
  it("a steady fall close to the trigger warns", () => {
    const analysis = analyze([1_460_000, 1_440_000, 1_420_000, 1_410_000, 1_405_000]);
    expect(analysis.declining).toBe(true);
    expect(analysis.warn).toBe(true);
    expect(analysis.nextThreshold?.stage).toBe(1);
    expect(analysis.explanation).toMatch(/would reach/);
  });

  it("a rising supply never warns", () => {
    const analysis = analyze([1_400_000, 1_420_000, 1_440_000, 1_460_000, 1_480_000]);
    expect(analysis.declining).toBe(false);
    expect(analysis.warn).toBe(false);
    expect(analysis.explanation).toMatch(/level or rising/);
  });

  it("THE GUARD: a series that ends higher than it started never warns", () => {
    // Noisy but recovered. A line fitted through this slopes downward
    // while the reservoir is actually refilling.
    const analysis = analyze([1_405_000, 1_500_000, 1_480_000, 1_420_000, 1_410_000, 1_406_000]);
    expect(analysis.slopePerDay).toBeLessThan(0);
    expect(analysis.declining).toBe(false);
    expect(analysis.warn).toBe(false);
    expect(analysis.explanation).toMatch(/not consistently lower/);
  });

  it("a real but glacial decline does not warn", () => {
    const analysis = analyze([1_900_000, 1_899_990, 1_899_980, 1_899_970, 1_899_960]);
    expect(analysis.declining).toBe(true);
    expect(analysis.warn).toBe(false);
    expect(analysis.daysToThreshold).toBeGreaterThan(30);
    expect(analysis.explanation).toMatch(/outside the 30-day warning horizon/);
  });

  it("respects a caller-supplied horizon", () => {
    // Falls 20,000/day and sits 100,000 above the trigger: five days out.
    const readings = series([1_580_000, 1_560_000, 1_540_000, 1_520_000, 1_500_000]);
    const short = analyzeTrend(readings, LCRA_THRESHOLDS, { now: NOW, horizonDays: 1 });
    const long = analyzeTrend(readings, LCRA_THRESHOLDS, { now: NOW, horizonDays: 365 });
    expect(short.warn).toBe(false);
    expect(long.warn).toBe(true);
  });

  it("says so plainly when already past every documented trigger", () => {
    const analysis = analyze([880_000, 870_000, 860_000, 850_000, 840_000]);
    expect(analysis.declining).toBe(true);
    expect(analysis.nextThreshold).toBeNull();
    expect(analysis.warn).toBe(false);
    expect(analysis.explanation).toMatch(/past every documented trigger/);
  });
});

describe("the projected stage", () => {
  it("is the stage of the threshold about to be crossed", () => {
    expect(projectedStage(analyze([1_460_000, 1_440_000, 1_420_000, 1_410_000, 1_405_000]))).toBe(1);
  });

  it("is Stage 2 when the next trigger below is the deeper one", () => {
    expect(projectedStage(analyze([1_000_000, 960_000, 930_000, 910_000, 905_000]))).toBe(2);
  });

  it("is null once there is no trigger left below the reading", () => {
    expect(projectedStage(analyze([880_000, 870_000, 860_000, 850_000]))).toBeNull();
  });
});
