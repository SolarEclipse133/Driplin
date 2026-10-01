import { describe, expect, it } from "vitest";
import { alertNature, resolvableTypes } from "./nature";

/**
 * Keeping the alert queue meaningful.
 *
 * The state this replaces, measured on a real four-property account:
 * seventeen unacknowledged alerts in thirteen days, twelve of them
 * announcing a problem Driplin had already corrected, none of them
 * closable by the customer, and nothing anywhere ever closing one.
 */

describe("things Driplin already handled", () => {
  it("files an automatic correction as activity, not a task", () => {
    // "schedule was out of compliance and has been corrected
    // automatically" is news. It was twelve of the seventeen.
    expect(alertNature("violation", "info")).toBe("activity");
  });

  it("files a stage change nobody has to act on as activity", () => {
    expect(alertNature("stage_change", "info")).toBe("activity");
  });
});

describe("things somebody has to do", () => {
  it.each([
    ["push_failed", "critical"],
    ["controller_unreadable", "critical"],
    ["variance_expiring", "warning"],
    ["work_order_stale", "critical"],
  ])("keeps %s as a task", (type, severity) => {
    expect(alertNature(type, severity as "critical" | "warning")).toBe("task");
  });

  it("promotes a stage change that left properties outside the rules", () => {
    expect(alertNature("stage_change", "critical")).toBe("task");
  });

  it("promotes a violation Driplin could not correct", () => {
    expect(alertNature("violation", "critical")).toBe("task");
  });

  it("treats an unfamiliar kind as a task", () => {
    // Being wrongly chased is recoverable. Being wrongly ignored is the
    // failure this product exists to prevent.
    expect(alertNature("something_new", "warning")).toBe("task");
  });
});

describe("what a controller's current state settles", () => {
  it("closes the unreadable alert once it can be read", () => {
    expect(resolvableTypes({ compliant: null, readable: true })).toContain(
      "controller_unreadable"
    );
  });

  it("closes the compliance tasks once it complies again", () => {
    const types = resolvableTypes({ compliant: true, readable: true });
    expect(types).toContain("push_failed");
    expect(types).toContain("violation");
  });

  it("closes a stale work order once the property complies", () => {
    // The work is evidently done, whether or not anyone marked it.
    expect(resolvableTypes({ compliant: true, readable: true })).toContain(
      "work_order_stale"
    );
  });

  it("closes nothing while it is still out of compliance", () => {
    expect(resolvableTypes({ compliant: false, readable: true })).toEqual([
      "controller_unreadable",
    ]);
  });

  it("closes nothing at all while it cannot be read", () => {
    // Unreadable means Driplin knows nothing, and knowing nothing is not
    // grounds for closing somebody's outstanding task.
    expect(resolvableTypes({ compliant: null, readable: false })).toEqual([]);
  });

  it("does not close a variance warning on compliance", () => {
    // A variance expiring is about a document running out, which being
    // compliant today says nothing about.
    expect(resolvableTypes({ compliant: true, readable: true })).not.toContain(
      "variance_expiring"
    );
  });
});
