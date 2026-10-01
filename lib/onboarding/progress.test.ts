import { describe, expect, it } from "vitest";
import { setupProgress } from "./progress";

/**
 * Getting a new account to the point where Driplin does something.
 *
 * The failure this replaces: sign up, see "No properties yet", add a
 * property, see no verdict, conclude the product is broken. It was not
 * broken — it was waiting for the nightly run, and nothing said so.
 */

const empty = { propertyCount: 0, monitoredCount: 0, everChecked: false };

describe("a brand new account", () => {
  it("points at the first step and no other", () => {
    const p = setupProgress(empty);
    expect(p.steps.map((s) => s.current)).toEqual([true, false, false]);
    expect(p.doneCount).toBe(0);
    expect(p.complete).toBe(false);
  });

  it("explains why the street number matters, rather than just asking for it", () => {
    const [property] = setupProgress(empty).steps;
    expect(property.detail).toContain("watering day");
  });

  it("mentions importing, so somebody with forty does not start typing", () => {
    expect(setupProgress(empty).steps[0].detail).toContain("spreadsheet");
  });

  it("does not offer a controller link before there is a property to open", () => {
    expect(setupProgress(empty).steps[1].href).toBeNull();
  });
});

describe("once a property exists", () => {
  const added = { propertyCount: 3, monitoredCount: 0, everChecked: false };

  it("moves on to the controller", () => {
    const p = setupProgress(added);
    expect(p.steps[0].done).toBe(true);
    expect(p.steps[1].current).toBe(true);
    expect(p.steps[1].href).toBe("/properties");
  });

  it("counts what has been added", () => {
    expect(setupProgress(added).steps[0].detail).toContain("3 properties");
  });

  it("says a property alone is not enough", () => {
    expect(setupProgress(added).steps[1].detail).toContain(
      "part that makes Driplin work"
    );
  });

  it("offers the unconnected-timer route, not just the smart ones", () => {
    // Most HOA common-area irrigation runs on hardware with no network.
    expect(setupProgress(added).steps[1].detail).toMatch(/dial|timer/);
  });
});

describe("waiting for the first check", () => {
  const connected = { propertyCount: 2, monitoredCount: 2, everChecked: false };

  it("is explicitly not the customer's move", () => {
    const check = setupProgress(connected).steps[2];
    expect(check.current).toBe(true);
    expect(check.href).toBeNull();
    expect(check.action).toBeNull();
  });

  it("says when it will happen and that silence is normal", () => {
    const check = setupProgress(connected).steps[2];
    expect(check.detail).toContain("tonight");
    expect(check.detail).toContain("Nothing to do");
  });
});

describe("once it is all working", () => {
  it("reports complete, so the caller can stop showing any of it", () => {
    const p = setupProgress({
      propertyCount: 5,
      monitoredCount: 5,
      everChecked: true,
    });
    expect(p.complete).toBe(true);
    expect(p.doneCount).toBe(3);
    expect(p.steps.every((s) => !s.current)).toBe(true);
  });
});

describe("a portfolio that is only partly set up", () => {
  it("counts the controller step done as soon as anything is watched", () => {
    // Forty properties with one controller is still past the step that
    // teaches what a controller is for. The monitoring-gap notice handles
    // the other thirty-nine.
    const p = setupProgress({
      propertyCount: 40,
      monitoredCount: 1,
      everChecked: true,
    });
    expect(p.complete).toBe(true);
  });
});
