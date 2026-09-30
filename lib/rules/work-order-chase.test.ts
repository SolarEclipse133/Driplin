import { describe, expect, it } from "vitest";
import {
  ESCALATE_DAYS,
  FIRST_CHASE_DAYS,
  REPEAT_EVERY_DAYS,
  decideChase,
  type OpenWorkOrder,
} from "./work-order-chase";

/**
 * Chasing a work order nobody acted on.
 *
 * Two failures to avoid, pulling in opposite directions. Never chasing
 * means a property waters illegally for weeks while the manager believes
 * the landscaper handled it. Chasing daily means the alerts get muted,
 * and then the real one is muted with them.
 */

const NOW = Date.parse("2026-09-30T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

function order(over: Partial<OpenWorkOrder> = {}): OpenWorkOrder {
  return {
    id: "wo1",
    propertyName: "Zilker Terrace",
    vendorName: "Hill Country Lawn",
    createdAt: daysAgo(5),
    expiresAt: inDays(9),
    stillNonCompliant: true,
    lastChasedAt: null,
    ...over,
  };
}

describe("nothing to chase", () => {
  it("stays quiet once the property is compliant again", () => {
    // The work got done, whether or not anyone marked it. Driplin is a
    // compliance tool, not a to-do list.
    const d = decideChase(order({ stillNonCompliant: false }), NOW);
    expect(d.chase).toBe(false);
  });

  it("stays quiet even on a long-dead order once compliance returns", () => {
    const d = decideChase(
      order({ stillNonCompliant: false, createdAt: daysAgo(90), expiresAt: daysAgo(60) }),
      NOW
    );
    expect(d.chase).toBe(false);
  });

  it("gives the vendor a working week's grace", () => {
    for (const age of [0, 1, FIRST_CHASE_DAYS - 1]) {
      const d = decideChase(order({ createdAt: daysAgo(age) }), NOW);
      expect(d.chase, `age ${age}`).toBe(false);
    }
  });
});

describe("chasing a slow vendor", () => {
  it("chases once the grace period is up", () => {
    const d = decideChase(order({ createdAt: daysAgo(FIRST_CHASE_DAYS) }), NOW);
    expect(d.chase).toBe(true);
    if (d.chase) {
      expect(d.severity).toBe("warning");
      expect(d.message).toContain("Hill Country Lawn");
      expect(d.linkExpired).toBe(false);
    }
  });

  it("escalates to critical after a week of illegal watering", () => {
    const d = decideChase(order({ createdAt: daysAgo(ESCALATE_DAYS) }), NOW);
    expect(d.chase).toBe(true);
    if (d.chase) expect(d.severity).toBe("critical");
  });

  it("names the property and the age, so the alert can be acted on", () => {
    const d = decideChase(order({ createdAt: daysAgo(9) }), NOW);
    if (!d.chase) throw new Error("expected a chase");
    expect(d.message).toContain("Zilker Terrace");
    expect(d.message).toContain("9 days");
  });

  it("copes with no vendor on the order", () => {
    const d = decideChase(order({ vendorName: null, createdAt: daysAgo(4) }), NOW);
    if (!d.chase) throw new Error("expected a chase");
    expect(d.message).toContain("the vendor");
  });
});

describe("not becoming noise", () => {
  it("says nothing when it chased recently", () => {
    const d = decideChase(
      order({ createdAt: daysAgo(20), lastChasedAt: daysAgo(1) }),
      NOW
    );
    expect(d.chase).toBe(false);
  });

  it.each([1, 3, REPEAT_EVERY_DAYS - 1])(
    "still says nothing %i days after the last chase",
    (since) => {
      const d = decideChase(
        order({ createdAt: daysAgo(30), lastChasedAt: daysAgo(since) }),
        NOW
      );
      expect(d.chase).toBe(false);
    }
  );

  it("chases again once a full week has passed", () => {
    const d = decideChase(
      order({ createdAt: daysAgo(30), lastChasedAt: daysAgo(REPEAT_EVERY_DAYS) }),
      NOW
    );
    expect(d.chase).toBe(true);
  });

  it("does not repeat daily on a month-old order", () => {
    // Walk a month day by day and count how often it would fire.
    let lastChasedAt: string | null = null;
    let fired = 0;
    for (let day = 0; day <= 30; day++) {
      const at = Date.parse("2026-09-01T12:00:00Z") + day * 86_400_000;
      const d = decideChase(
        { ...order({ createdAt: "2026-09-01T12:00:00Z", expiresAt: "2026-10-15T12:00:00Z" }), lastChasedAt },
        at
      );
      if (d.chase) {
        fired += 1;
        lastChasedAt = new Date(at).toISOString();
      }
    }
    // Day 3, then weekly: about five in a month, not thirty.
    expect(fired).toBeLessThanOrEqual(5);
    expect(fired).toBeGreaterThan(0);
  });
});

describe("an expired vendor link", () => {
  it("is critical, because the vendor cannot act at all now", () => {
    const d = decideChase(order({ expiresAt: daysAgo(1) }), NOW);
    expect(d.chase).toBe(true);
    if (d.chase) {
      expect(d.severity).toBe("critical");
      expect(d.linkExpired).toBe(true);
      expect(d.message).toContain("expired");
    }
  });

  it("is raised even inside the usual grace period", () => {
    // Nothing can happen until a new link is sent, so waiting is pointless.
    const d = decideChase(
      order({ createdAt: daysAgo(1), expiresAt: daysAgo(0) }),
      NOW
    );
    expect(d.chase).toBe(true);
  });

  it("still respects the weekly cadence", () => {
    const d = decideChase(
      order({ expiresAt: daysAgo(30), lastChasedAt: daysAgo(2) }),
      NOW
    );
    expect(d.chase).toBe(false);
  });
});
