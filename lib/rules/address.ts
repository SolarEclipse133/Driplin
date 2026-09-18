/**
 * Address-digit helpers for watering-day assignment.
 *
 * Every Central Texas city Driplin supports assigns watering days by
 * the LAST DIGIT of the street address number — Austin per its Drought
 * Contingency Plan, San Antonio per SAWS' schedule. Only the digit →
 * day mapping differs, and that lives in each city's config under
 * lib/jurisdictions/. This file only extracts the digit.
 */

const STREET_NUMBER_RE = /^[0-9]+[A-Za-z]?$/;

/** "1204" and "1204B" are valid; "12-B", "B12", "" are not. */
export function isValidStreetNumber(streetNumber: string): boolean {
  return STREET_NUMBER_RE.test(streetNumber.trim());
}

/**
 * Last digit of the numeric part of the street number: "1204B" → 4.
 * Returns null for invalid input.
 */
export function getWateringDigit(streetNumber: string): number | null {
  const trimmed = streetNumber.trim();
  if (!isValidStreetNumber(trimmed)) return null;
  const digits = trimmed.replace(/[A-Za-z]/g, "");
  return Number(digits[digits.length - 1]);
}
