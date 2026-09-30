import { describe, expect, it } from "vitest";
import { meterFor } from "./meter";

/**
 * Which meter a controller is on decides which watering day applies to
 * it. One HOA holds several — the entrance, the pool, a median — each
 * on its own address and its own day.
 *
 * The rule that must not drift: a controller overrides its property
 * only when it actually SAYS something. Blank means inherit. If that
 * ever silently flips, every existing controller changes day.
 */

const PROPERTY = {
  street_number: "1204",
  street_name: "W Oltorf St",
  no_street_address: false,
};
const ADDRESSLESS = {
  street_number: null,
  street_name: "Oak Ridge median",
  no_street_address: true,
};

describe("blank means inherit the property", () => {
  it.each([
    ["nothing at all", {}],
    ["an empty street number", { meter_street_number: "" }],
    ["an explicit false", { meter_no_street_address: false }],
    ["a label on its own", { meter_label: "Pool" }],
    ["a null number", { meter_street_number: null }],
  ])("%s", (_name, controller) => {
    const meter = meterFor(PROPERTY, controller);
    expect(meter.source).toBe("property");
    expect(meter.digit).toBe(4);
  });

  it("inherits an address-less property too", () => {
    expect(meterFor(ADDRESSLESS, {}).noStreetAddress).toBe(true);
  });
});

describe("the controller's own meter wins when declared", () => {
  it("its own street number", () => {
    const meter = meterFor(PROPERTY, { meter_street_number: "1211" });
    expect([meter.digit, meter.source]).toEqual([1, "controller"]);
  });

  it("its own meter with no address, on a property that has one", () => {
    const meter = meterFor(PROPERTY, { meter_no_street_address: true });
    expect([meter.noStreetAddress, meter.source]).toEqual([true, "controller"]);
  });

  it("its own address, on a property that has none", () => {
    const meter = meterFor(ADDRESSLESS, { meter_street_number: "1210" });
    expect([meter.digit, meter.noStreetAddress]).toEqual([0, false]);
  });

  it("reports an unusable number as unknown rather than guessing", () => {
    expect(meterFor(PROPERTY, { meter_street_number: "12-B" }).digit).toBeNull();
  });
});

describe("what a manager reads", () => {
  it.each([
    [{}, "1204 W Oltorf St"],
    [{ meter_street_number: "1211", meter_label: "North entrance" }, "1211 (North entrance)"],
    [{ meter_no_street_address: true, meter_label: "Median at 3rd" }, "Median at 3rd — no street address"],
  ])("%o reads as %s", (controller, expected) => {
    expect(meterFor(PROPERTY, controller).describe).toBe(expected);
  });
});
