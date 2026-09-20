import { getWateringDigit } from "./address";

/**
 * Which meter a controller is on, and therefore which watering day
 * applies to it.
 *
 * One HOA can hold several irrigation meters — the front entrance, the
 * pool, a median down the street — each with its own service address
 * and its own assigned day. The address therefore belongs to the
 * METER, not to the property.
 *
 * Controllers carry that address only when it differs. Null means
 * "inherit the property", which keeps the common case (one property,
 * one meter) free of duplicated data and leaves every pre-existing
 * controller behaving exactly as it did.
 */

export interface PropertyAddress {
  street_number?: string | null;
  street_name?: string | null;
  no_street_address?: boolean | null;
}

export interface ControllerMeter {
  meter_street_number?: string | null;
  meter_no_street_address?: boolean | null;
  meter_label?: string | null;
}

export interface MeterLocation {
  /** Address last-digit, or null when it cannot be determined. */
  digit: number | null;
  noStreetAddress: boolean;
  /** Whether this came from the controller's own meter or the property. */
  source: "controller" | "property";
  /** What to show a manager: "1204 W Oltorf St" or "North entrance (no street address)". */
  describe: string;
}

/**
 * A controller overrides its property only when it actually says
 * something: either its own street number, or an explicit "this meter
 * has no address". Anything else inherits.
 */
function overrides(controller: ControllerMeter): boolean {
  return (
    controller.meter_no_street_address === true ||
    (controller.meter_street_number ?? "") !== ""
  );
}

export function meterFor(
  property: PropertyAddress,
  controller: ControllerMeter = {}
): MeterLocation {
  const label = controller.meter_label?.trim();

  if (overrides(controller)) {
    if (controller.meter_no_street_address === true) {
      return {
        digit: 0,
        noStreetAddress: true,
        source: "controller",
        describe: label ? `${label} — no street address` : "No street address",
      };
    }
    const number = controller.meter_street_number ?? "";
    return {
      digit: getWateringDigit(number),
      noStreetAddress: false,
      source: "controller",
      describe: label ? `${number} (${label})` : `Meter at ${number}`,
    };
  }

  // Inherit the property.
  if (property.no_street_address) {
    return {
      digit: 0,
      noStreetAddress: true,
      source: "property",
      describe: label ? `${label} — no street address` : "No street address",
    };
  }
  const number = property.street_number ?? "";
  const full = `${number} ${property.street_name ?? ""}`.trim();
  return {
    digit: getWateringDigit(number),
    noStreetAddress: false,
    source: "property",
    describe: label ? `${full} (${label})` : full,
  };
}
