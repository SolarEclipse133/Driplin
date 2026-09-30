import { describe, expect, it } from "vitest";
import { assessHealth, STALE_AFTER_HOURS } from "./health";

/**
 * Has the nightly job stopped?
 *
 * Driplin exists to notice when something quietly stopped being true.
 * The failure this guards against is the product doing exactly that to
 * itself: the cron breaks, every dashboard keeps showing the last good
 * result, and nobody finds out until a city does.
 */

const NOW = Date.parse("2026-09-30T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("a healthy job", () => {
  it("is not stale just after a run", () => {
    const health = assessHealth(hoursAgo(1), null, false, NOW);
    expect(health.stale).toBe(false);
    expect(Math.round(health.hoursSinceSuccess!)).toBe(1);
  });

  it("tolerates the scheduler's hour-wide firing window", () => {
    // Vercel fires anywhere within its hour, so a late run followed by
    // an early one must not read as a failure — a warning that cries
    // wolf is a warning people learn to ignore.
    expect(assessHealth(hoursAgo(26), null, false, NOW).stale).toBe(false);
    expect(assessHealth(hoursAgo(STALE_AFTER_HOURS), null, false, NOW).stale).toBe(false);
  });
});

describe("a job that has stopped", () => {
  it("is stale once a run has clearly been missed", () => {
    expect(assessHealth(hoursAgo(STALE_AFTER_HOURS + 1), null, false, NOW).stale).toBe(true);
  });

  it.each([48, 72, 24 * 30])("is stale after %i hours", (hours) => {
    expect(assessHealth(hoursAgo(hours), null, false, NOW).stale).toBe(true);
  });

  it("carries the last error through so it can be shown", () => {
    const health = assessHealth(hoursAgo(50), "LCRA returned HTTP 503", false, NOW);
    expect(health.stale).toBe(true);
    expect(health.lastError).toBe("LCRA returned HTTP 503");
  });

  it("is stale when it has run repeatedly and never once succeeded", () => {
    const health = assessHealth(null, "CRON_SECRET mismatch", false, NOW);
    expect(health.stale).toBe(true);
    expect(health.lastSuccessAt).toBeNull();
  });
});

describe("a deployment that has not had its first night", () => {
  it("is NOT reported as broken", () => {
    const health = assessHealth(null, null, true, NOW);
    expect(health.neverRun).toBe(true);
    expect(health.stale).toBe(false);
  });

  it("is distinguishable from having run and failed", () => {
    expect(assessHealth(null, null, true, NOW).stale).toBe(false);
    expect(assessHealth(null, "boom", false, NOW).stale).toBe(true);
  });
});
