/**
 * Jurisdiction model: everything that varies between the cities Driplin
 * supports. Adding a city means adding one config file and one registry
 * entry — no changes to the compliance engine, dashboard, or reports.
 */

import { Weekday } from "@/lib/controllers/types";

export type DroughtStage = 0 | 1 | 2 | 3 | 4;
export const ALL_STAGES: DroughtStage[] = [0, 1, 2, 3, 4];

/** A daily window when irrigation is allowed, 24h "HH:MM". */
export interface TimeWindow {
  start: string;
  end: string;
}

export interface StageRule {
  /** What this city calls the stage, e.g. "Conservation Stage", "Stage 2". */
  name: string;
  /** Allowed watering days per address last-digit (0–9). Empty = none. */
  daysByDigit: Record<number, Weekday[]>;
  /** Times of day when automatic irrigation may run on an allowed day. */
  allowedWindows: TimeWindow[];
  /** One-line description shown to managers and printed in reports. */
  summary: string;
  /**
   * False when these rules have NOT been confirmed against the city's
   * published ordinance. Driplin will never auto-push a schedule based
   * on an unverified rule set — it flags the property for human review
   * instead. Pushing a wrong schedule is worse than pushing none.
   */
  verified: boolean;
}

export interface IndicatorReading {
  /** The numeric value the thresholds are compared against. */
  value: number;
  /** How the source stated it, kept verbatim for the audit trail. */
  displayText: string;
  /** The full source sentence/snippet, for the admin panel. */
  rawText: string;
  readAt: string;
}

/**
 * An automated leading indicator for a city (lake storage, aquifer
 * level). It NEVER changes the active stage — it only suggests one, so
 * an admin can verify against the city's official declaration.
 */
export interface IndicatorConfig {
  id: string;
  /** e.g. "LCRA combined storage (Lakes Travis + Buchanan)". */
  label: string;
  unit: string;
  sourceUrl: string;
  /** Which stage this reading historically corresponds to. */
  suggestStage(value: number): DroughtStage;
  fetchReading(): Promise<IndicatorReading>;
  /** Why a single crossing isn't a stage change; shown in the alert. */
  caveat: string;
}

export interface Jurisdiction {
  /** Stable key stored on properties and stage rows, e.g. "austin". */
  id: string;
  /** Display name, e.g. "Austin". */
  name: string;
  /** The utility that declares stages, e.g. "Austin Water". */
  utility: string;
  /** Where an admin verifies the current stage. */
  officialUrl: string;
  stages: Record<DroughtStage, StageRule>;
  indicator?: IndicatorConfig;
  /** City names that map to this jurisdiction when adding a property. */
  cityNames: string[];
}
