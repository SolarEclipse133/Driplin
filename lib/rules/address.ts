/**
 * Address-digit helpers for Austin's watering-day assignment.
 *
 * The City of Austin assigns each address a watering day based on the
 * LAST DIGIT of the street address number, per the council-approved
 * Drought Contingency Plan (City Code Chapter 6-4; plan last updated
 * November 2024). See https://www.austintexas.gov/department/water-conservation
 * ("Your Watering Schedule").
 *
 * The digit → day lookup table itself lives in watering-config.ts
 * (added with the rules engine); this file only extracts the digit.
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
