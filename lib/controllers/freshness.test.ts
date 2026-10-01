import { describe, expect, it } from "vitest";
import {
  SCHEDULE_STALE_AFTER_HOURS,
  describeStaleness,
  scheduleFreshness,
} from "./freshness";

/**
 * When Driplin should stop believing its own cache.
 *
 * The failure this guards against: a vendor key is rotated, every sync
 * from then on fails, the cache freezes at "compliant", and Driplin goes
 * on reporting compliant for months about hardware it can no longer see.
 * A green badge on an unreadable controller is worse than no badge.
 */

const NOW = Date.parse("2026-10-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("a cache Driplin can still trust", () => {
  it("accepts a schedule read moments ago", () => {
    expect(scheduleFreshness(hoursAgo(0.1), NOW).usable).toBe(true);
  });

  it("survives a single missed night", () => {
    // One night's grace would be too tight: a scheduler that drifts
    // across an hour would blank a healthy portfolio.
    expect(scheduleFreshness(hoursAgo(26), NOW).usable).toBe(true);
  });

  it("survives two missed nights", () => {
    expect(scheduleFreshness(hoursAgo(50), NOW).usable).toBe(true);
  });

  it("accepts the boundary itself", () => {
    expect(scheduleFreshness(hoursAgo(SCHEDULE_STALE_AFTER_HOURS), NOW).usable).toBe(true);
  });

  it("reports the age so it can be shown", () => {
    const f = scheduleFreshness(hoursAgo(10), NOW);
    expect(Math.round(f.ageHours!)).toBe(10);
  });

  it("is not upset by a cache timestamped slightly in the future", () => {
    // Clock skew between the database and the runtime is not a reason to
    // distrust a schedule that was just read.
    expect(scheduleFreshness(hoursAgo(-0.5), NOW).usable).toBe(true);
  });
});

describe("a cache Driplin must stop believing", () => {
  it("refuses it one hour past the limit", () => {
    const f = scheduleFreshness(hoursAgo(SCHEDULE_STALE_AFTER_HOURS + 1), NOW);
    expect(f.usable).toBe(false);
    if (!f.usable) expect(f.reason).toBe("stale");
  });

  it.each([96, 24 * 14, 24 * 365])("refuses a cache %i hours old", (hours) => {
    expect(scheduleFreshness(hoursAgo(hours), NOW).usable).toBe(false);
  });

  it("distinguishes never-read from gone-stale", () => {
    // They need different fixes: one is "finish connecting it", the
    // other is "your vendor connection broke".
    const never = scheduleFreshness(null, NOW);
    expect(never.usable).toBe(false);
    if (!never.usable) expect(never.reason).toBe("never_read");

    const stale = scheduleFreshness(hoursAgo(200), NOW);
    if (!stale.usable) expect(stale.reason).toBe("stale");
  });

  it("treats an unreadable timestamp as never read rather than fresh", () => {
    // Failing open here would be the whole bug, in one line.
    const f = scheduleFreshness("not a date", NOW);
    expect(f.usable).toBe(false);
  });
});

describe("explaining it to the person who has to act", () => {
  it("names the days and the likely cause", () => {
    const text = describeStaleness(scheduleFreshness(hoursAgo(120), NOW), "Rachio");
    expect(text).toContain("5 days");
    expect(text).toContain("Rachio");
    expect(text).toContain("may no longer be");
  });

  it("says something different when it was never read", () => {
    const text = describeStaleness(scheduleFreshness(null, NOW), "Rachio");
    expect(text).toContain("never");
  });

  it("says nothing when the cache is fine", () => {
    expect(describeStaleness(scheduleFreshness(hoursAgo(2), NOW), "Rachio")).toBe("");
  });
});
