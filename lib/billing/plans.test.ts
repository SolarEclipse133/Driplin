import { describe, expect, it } from "vitest";
import { PLANS, entitlementsFor, planFor } from "./plans";

/**
 * What a plan allows.
 *
 * The load-bearing rule, restated here because it is the one that
 * protects someone who is not party to the billing dispute: limits
 * gate ADDING properties. Nothing about billing state may ever stop
 * compliance monitoring of a property already being watched.
 */

const NOW = Date.parse("2026-09-30T12:00:00Z");
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

describe("defaults", () => {
  it("an account with no subscription row is a pilot", () => {
    expect(entitlementsFor(null, 0, NOW).plan.id).toBe("pilot");
    expect(entitlementsFor(null, 0, NOW).propertyLimit).toBe(3);
  });

  it("an unrecognised plan name falls back to pilot", () => {
    expect(planFor("enterprise").id).toBe("pilot");
  });

  it("plans offer ascending headroom", () => {
    expect([PLANS.pilot.propertyLimit, PLANS.standard.propertyLimit, PLANS.portfolio.propertyLimit])
      .toEqual([3, 25, null]);
  });
});

describe("limits gate growth", () => {
  const pilot = (count: number) =>
    entitlementsFor(
      { plan: "pilot", status: "trialing", property_limit: 3, trial_ends_at: inDays(30) },
      count,
      NOW
    );

  it.each([
    [2, true],
    [3, false],
    [9, false],
  ])("%i properties against a limit of 3 -> canAdd %s", (count, expected) => {
    expect(pilot(count).canAddProperty).toBe(expected);
  });

  it("explains the limit in terms the customer can act on", () => {
    expect(pilot(3).blockedReason).toMatch(/Pilot plan covers 3 properties/);
  });

  it("portfolio has no limit", () => {
    expect(entitlementsFor({ plan: "portfolio", status: "active" }, 500, NOW).canAddProperty).toBe(true);
  });

  it("a per-account limit overrides the plan", () => {
    expect(
      entitlementsFor({ plan: "pilot", status: "active", property_limit: 40 }, 30, NOW).canAddProperty
    ).toBe(true);
  });
});

describe("trials", () => {
  it("counts the days left", () => {
    expect(
      entitlementsFor({ plan: "pilot", status: "trialing", trial_ends_at: inDays(14) }, 0, NOW).trialDaysLeft
    ).toBe(14);
  });

  it("an expired trial blocks adding but says monitoring continues", () => {
    const e = entitlementsFor({ plan: "pilot", status: "trialing", trial_ends_at: inDays(-1) }, 1, NOW);
    expect(e.trialExpired).toBe(true);
    expect(e.canAddProperty).toBe(false);
    expect(e.blockedReason).toMatch(/still being monitored/);
  });

  it("a paying account has no countdown", () => {
    expect(entitlementsFor({ plan: "standard", status: "active" }, 5, NOW).trialDaysLeft).toBeNull();
  });
});

describe("unpaid and cancelled", () => {
  it.each(["past_due", "cancelled"])("%s blocks growth and says monitoring continues", (status) => {
    const e = entitlementsFor({ plan: "standard", status, property_limit: 25 }, 5, NOW);
    expect(e.canAddProperty).toBe(false);
    expect(e.blockedReason).toMatch(/still being monitored/);
  });
});

describe("billing can never stop monitoring", () => {
  // Pin the whole surface. If someone later adds monitoringEnabled,
  // alertsPaused or checksSuspended, this fails loudly rather than
  // shipping quietly.
  it("exposes exactly these fields, and none of them pause monitoring", () => {
    const worst = entitlementsFor(
      { plan: "pilot", status: "cancelled", property_limit: 1, trial_ends_at: inDays(-400) },
      99,
      NOW
    );
    expect(Object.keys(worst).sort()).toEqual([
      "atLimit",
      "blockedReason",
      "canAddProperty",
      "plan",
      "propertyCount",
      "propertyLimit",
      "status",
      "trialDaysLeft",
      "trialExpired",
    ]);
    expect(worst.canAddProperty).toBe(false);
    expect(worst.propertyCount).toBe(99);
  });
});
