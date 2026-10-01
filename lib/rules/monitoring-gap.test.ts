import { describe, expect, it } from "vitest";
import { describeGap, monitoringGap, type PropertyMonitoring } from "./monitoring-gap";

/**
 * Telling the difference between failing and unknown.
 *
 * A property with nothing connected is not a non-compliant property; it
 * is a property Driplin knows nothing about. Reporting it as "0 of 40
 * compliant" invents forty failures, and reporting it as fine invents
 * forty passes. Both are lies, and the second is the dangerous one.
 */

const property = (over: Partial<PropertyMonitoring> = {}): PropertyMonitoring => ({
  id: "p1",
  name: "Zilker Terrace",
  controllerCount: 1,
  readableControllerCount: 1,
  ...over,
});

describe("counting what Driplin can actually judge", () => {
  it("counts a readable controller as monitored", () => {
    const g = monitoringGap([property()]);
    expect(g.monitored).toBe(1);
    expect(g.noController).toEqual([]);
    expect(g.lostContact).toEqual([]);
  });

  it("separates nothing-connected from lost-contact", () => {
    // They need different actions, from different people: one is finish
    // setting it up, the other is your vendor connection broke.
    const g = monitoringGap([
      property({ id: "a", controllerCount: 0, readableControllerCount: 0 }),
      property({ id: "b", controllerCount: 2, readableControllerCount: 0 }),
      property({ id: "c" }),
    ]);
    expect(g.noController.map((p) => p.id)).toEqual(["a"]);
    expect(g.lostContact.map((p) => p.id)).toEqual(["b"]);
    expect(g.monitored).toBe(1);
    expect(g.total).toBe(3);
  });

  it("counts a property with one readable and one broken controller as monitored", () => {
    // Driplin can still judge it. Its own compliance rollup handles the
    // broken one; this is about whether anything is being watched at all.
    const g = monitoringGap([property({ controllerCount: 2, readableControllerCount: 1 })]);
    expect(g.monitored).toBe(1);
    expect(g.lostContact).toEqual([]);
  });

  it("knows when it is watching nothing", () => {
    const g = monitoringGap([
      property({ controllerCount: 0, readableControllerCount: 0 }),
      property({ id: "b", controllerCount: 0, readableControllerCount: 0 }),
    ]);
    expect(g.watchingNothing).toBe(true);
  });

  it("does not call a brand new account a monitoring failure", () => {
    const g = monitoringGap([]);
    expect(g.watchingNothing).toBe(false);
    expect(describeGap(g)).toBeNull();
  });
});

describe("what the dashboard says", () => {
  it("says nothing when everything is monitored", () => {
    // The banner only means something if it is absent most of the time.
    expect(describeGap(monitoringGap([property(), property({ id: "b" })]))).toBeNull();
  });

  it("names the count and refuses to claim anything about them", () => {
    const g = monitoringGap([
      property({ controllerCount: 0, readableControllerCount: 0 }),
      property({ id: "b" }),
    ]);
    const text = describeGap(g)!;
    expect(text).toContain("1 of your 2 properties");
    expect(text).toContain("no controller connected");
    expect(text).toContain("making no compliance claim");
  });

  it("says so plainly when none of them are monitored", () => {
    // The state you land in straight after importing a portfolio.
    const all = Array.from({ length: 40 }, (_, i) =>
      property({ id: `p${i}`, controllerCount: 0, readableControllerCount: 0 })
    );
    const text = describeGap(monitoringGap(all))!;
    expect(text).toContain("None of your 40 properties are being checked");
  });

  it("reads correctly for a single property", () => {
    const text = describeGap(
      monitoringGap([property({ controllerCount: 0, readableControllerCount: 0 })])
    )!;
    expect(text).toContain("Your property is not being checked");
    expect(text).toContain("has no controller");
    expect(text).toContain("about it");
  });

  it("mentions both reasons when both apply", () => {
    const text = describeGap(
      monitoringGap([
        property({ id: "a", controllerCount: 0, readableControllerCount: 0 }),
        property({ id: "b", controllerCount: 1, readableControllerCount: 0 }),
      ])
    )!;
    expect(text).toContain("no controller connected");
    expect(text).toContain("can no longer read");
    expect(text).toContain(", and ");
  });
});
