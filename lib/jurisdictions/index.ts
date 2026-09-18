/**
 * The jurisdiction registry — the single list of cities Driplin
 * supports. Adding a city: write its config file, import it here, add
 * it to JURISDICTIONS. Nothing else in the app changes.
 */

import { AUSTIN } from "./austin";
import { SAN_ANTONIO } from "./san-antonio";
import { ROUND_ROCK } from "./round-rock";
import { GEORGETOWN } from "./georgetown";
import { CEDAR_PARK } from "./cedar-park";
import { LEANDER } from "./leander";
import { DroughtStage, Jurisdiction, StageRule } from "./types";

export * from "./types";

export const JURISDICTIONS: Jurisdiction[] = [
  AUSTIN,
  SAN_ANTONIO,
  ROUND_ROCK,
  GEORGETOWN,
  CEDAR_PARK,
  LEANDER,
];

export const DEFAULT_JURISDICTION_ID = AUSTIN.id;

export function getJurisdiction(id: string | null | undefined): Jurisdiction {
  return (
    JURISDICTIONS.find((j) => j.id === id) ??
    JURISDICTIONS.find((j) => j.id === DEFAULT_JURISDICTION_ID)!
  );
}

/** Best-guess jurisdiction for a property from its city field. */
export function jurisdictionForCity(city: string): Jurisdiction | null {
  const needle = city.trim().toLowerCase();
  return (
    JURISDICTIONS.find((j) => j.cityNames.includes(needle)) ?? null
  );
}

export function getStageRule(
  jurisdictionId: string,
  stage: DroughtStage
): StageRule {
  return getJurisdiction(jurisdictionId).stages[stage];
}

export function stageName(jurisdictionId: string, stage: DroughtStage): string {
  return getStageRule(jurisdictionId, stage).name;
}
