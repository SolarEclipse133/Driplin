import { describe, expect, it } from "vitest";
import { buildBenchmarks, formatDuration } from "./benchmarks";

/**
 * How long a property takes to act when Driplin flags something it
 * cannot fix itself.
 *
 * The subtle part, and the reason this exists: a broken controller is
 * re-flagged on EVERY compliance run, so the most recent flag is just
 * last night's check. Measuring from it would report a three-day-old
 * problem as six hours old — flattering and wrong.
 */

const H = (n: number) =>
  new Date(Date.parse("2026-09-01T00:00:00Z") + n * 3_600_000).toISOString();
const NOW = Date.parse(H(500));
const PROPERTIES = [
  { id: "p1", name: "Zilker" },
  { id: "p2", name: "Alamo" },
];

describe("where the clock starts", () => {
  it("measures from the FIRST failure, not the latest re-flag", () => {
    const summary = buildBenchmarks({
      properties: PROPERTIES,
      controllers: [{ id: "c1", propertyId: "p1", needsManualFix: false }],
      flags: [
        { controllerId: "c1", at: H(10) },
        { controllerId: "c1", at: H(34) },
        { controllerId: "c1", at: H(58) },
      ],
      confirmations: [{ controllerId: "c1", propertyId: "p1", at: H(80), verified: true }],
      now: NOW,
    });
    expect(summary.ranked[0].averageHours).toBe(70);
  });

  it("an open episode is measured from its first unresolved failure", () => {
    const summary = buildBenchmarks({
      properties: PROPERTIES,
      controllers: [{ id: "c1", propertyId: "p1", needsManualFix: true }],
      flags: [
        { controllerId: "c1", at: H(10) },
        { controllerId: "c1", at: H(400) },
      ],
      confirmations: [],
      now: NOW,
    });
    expect(Math.round(summary.waitingOnly[0].oldestOpenHours!)).toBe(490);
  });
});

describe("a claim is not a fix", () => {
  it("a confirmation that failed re-check does not stop the clock", () => {
    const summary = buildBenchmarks({
      properties: PROPERTIES,
      controllers: [{ id: "c1", propertyId: "p1", needsManualFix: false }],
      flags: [{ controllerId: "c1", at: H(10) }],
      confirmations: [
        { controllerId: "c1", propertyId: "p1", at: H(20), verified: false },
        { controllerId: "c1", propertyId: "p1", at: H(30), verified: true },
      ],
      now: NOW,
    });
    expect(summary.ranked[0].averageHours).toBe(20);
    expect(summary.ranked[0].unverifiedAttempts).toBe(1);
  });

  it("a confirmation with no preceding failure has no clock to stop", () => {
    const summary = buildBenchmarks({
      properties: PROPERTIES,
      controllers: [{ id: "c1", propertyId: "p1", needsManualFix: false }],
      flags: [],
      confirmations: [{ controllerId: "c1", propertyId: "p1", at: H(20), verified: true }],
      now: NOW,
    });
    expect(summary.totalFixes).toBe(0);
  });
});

describe("absence is the good case, not a gap", () => {
  it("a property Driplin can always correct remotely never appears", () => {
    const summary = buildBenchmarks({
      properties: PROPERTIES,
      controllers: [{ id: "c2", propertyId: "p2", needsManualFix: false }],
      flags: [],
      confirmations: [],
      now: NOW,
    });
    expect(summary.ranked).toHaveLength(0);
    expect(summary.waitingOnly).toHaveLength(0);
    expect(summary.portfolioAverageHours).toBeNull();
  });
});

describe("ranking", () => {
  it("puts the slowest property first and spans its controllers", () => {
    const summary = buildBenchmarks({
      properties: PROPERTIES,
      controllers: [
        { id: "c1", propertyId: "p1", needsManualFix: false },
        { id: "c3", propertyId: "p1", needsManualFix: false },
        { id: "c2", propertyId: "p2", needsManualFix: false },
      ],
      flags: [
        { controllerId: "c1", at: H(0) },
        { controllerId: "c3", at: H(0) },
        { controllerId: "c2", at: H(0) },
      ],
      confirmations: [
        { controllerId: "c1", propertyId: "p1", at: H(10), verified: true },
        { controllerId: "c3", propertyId: "p1", at: H(30), verified: true },
        { controllerId: "c2", propertyId: "p2", at: H(5), verified: true },
      ],
      now: NOW,
    });
    expect(summary.ranked.map((r) => [r.name, r.averageHours])).toEqual([
      ["Zilker", 20],
      ["Alamo", 5],
    ]);
    expect(summary.portfolioAverageHours).toBe(15);
  });

  it("keeps separate episodes on one controller separate", () => {
    const summary = buildBenchmarks({
      properties: PROPERTIES,
      controllers: [{ id: "c1", propertyId: "p1", needsManualFix: false }],
      flags: [
        { controllerId: "c1", at: H(10) },
        { controllerId: "c1", at: H(100) },
      ],
      confirmations: [
        { controllerId: "c1", propertyId: "p1", at: H(20), verified: true },
        { controllerId: "c1", propertyId: "p1", at: H(140), verified: true },
      ],
      now: NOW,
    });
    expect([summary.ranked[0].fixes, summary.ranked[0].averageHours, summary.ranked[0].slowestHours])
      .toEqual([2, 25, 40]);
  });
});

describe("formatDuration", () => {
  it.each([
    [0.5, "30m"],
    [18.4, "18h"],
    [77, "3.2 days"],
    [null, "—"],
  ])("%s -> %s", (hours, expected) => {
    expect(formatDuration(hours as number | null)).toBe(expected);
  });
});
