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

/**
 * How a utility classifies the ACCOUNT the irrigation meter sits on.
 *
 * This is not a detail. Austin and Leander both publish DIFFERENT
 * watering days for commercial and multifamily accounts than for
 * single-family residential ones, so getting it wrong sends a property
 * to water on a day the city prohibits. HOA common areas, apartment
 * communities and commercial sites are "commercial" — the class should
 * match how the water bill for that meter is categorized.
 */
export type PropertyClass = "residential" | "commercial";

/**
 * What kind of irrigation is on the meter. Austin gives drip and
 * hose-end sprinklers a more generous schedule than automatic in-ground
 * systems, so this changes the answer too.
 */
export type IrrigationType = "automatic" | "drip_or_hose";

export interface PropertyProfile {
  propertyClass: PropertyClass;
  irrigationType: IrrigationType;
  /**
   * True when the meter has NO street address at all — a median, a
   * neighborhood entryway, a greenbelt strip. There is no digit to
   * derive, so these cities' digit tables simply do not apply.
   */
  noStreetAddress?: boolean;
}

/**
 * Driplin's customers manage HOA common areas and commercial sites on
 * automatic systems. That is the assumption when nothing says otherwise.
 */
export const DEFAULT_PROFILE: PropertyProfile = {
  propertyClass: "commercial",
  irrigationType: "automatic",
};

/** The part of a stage's rules that can vary by property profile. */
export interface Schedule {
  /** Allowed watering days per address last-digit (0-9). Empty = none. */
  daysByDigit: Record<number, Weekday[]>;
  /** Times of day when irrigation may run on an allowed day. */
  allowedWindows: TimeWindow[];
  /** One-line description shown to managers and printed in reports. */
  summary: string;
}

/**
 * Keys for per-profile overrides, most specific first:
 *   "commercial:automatic"  - exact match
 *   "commercial"            - any irrigation type on that class
 * Anything not declared falls back to the stage's own base schedule.
 */
export type ScheduleVariantKey =
  | `${PropertyClass}:${IrrigationType}`
  | PropertyClass;

export interface StageRule extends Schedule {
  /** What this city calls the stage, e.g. "Conservation Stage", "Stage 2". */
  name: string;
  /**
   * Schedules that differ by property class or irrigation type. Only
   * cities that actually publish such a split declare these; everywhere
   * else the base schedule applies to everyone.
   */
  variants?: Partial<Record<ScheduleVariantKey, Schedule>>;
  /**
   * Schedule for meters with no street address. SAWS publishes one
   * ("Areas without a street address, such as medians and neighborhood
   * entryways, water on Wednesday"); most cities do not.
   *
   * ABSENT MEANS UNKNOWN, NOT UNRESTRICTED. When a city publishes no
   * such rule, Driplin makes no judgement and asks the manager to check
   * with the utility. Inventing a digit for a median would produce a
   * confident wrong day, which is the failure this field exists to
   * prevent.
   */
  noAddressSchedule?: Schedule;
  /**
   * False when these rules have NOT been confirmed against the city's
   * published ordinance. Driplin will never auto-push a schedule based
   * on an unverified rule set — it flags the property for human review
   * instead. Pushing a wrong schedule is worse than pushing none.
   */
  verified: boolean;
  /**
   * True when we do not know this city's day assignment at all (e.g. the
   * city publishes it only as an image). Driplin then makes no
   * compliance judgement and no schedule change: the property is shown
   * as unverified with a pointer to the city's page. Guessing a day
   * would be worse than admitting we don't know it.
   */
  scheduleUnknown?: boolean;
}

/**
 * The schedule that actually applies to one property under one stage.
 * Checks the exact class+type override, then a class-wide one, then
 * falls back to the stage's base schedule.
 */
export function resolveSchedule(
  rule: StageRule,
  profile: PropertyProfile = DEFAULT_PROFILE
): Schedule {
  // No street address: only the city's own rule for such areas applies.
  // Never fall back to a digit table — there is no digit.
  if (profile.noStreetAddress) {
    return (
      rule.noAddressSchedule ?? {
        daysByDigit: {},
        allowedWindows: rule.allowedWindows,
        summary: rule.summary,
      }
    );
  }
  const exact = rule.variants?.[
    `${profile.propertyClass}:${profile.irrigationType}` as ScheduleVariantKey
  ];
  if (exact) return exact;
  const byClass = rule.variants?.[profile.propertyClass];
  if (byClass) return byClass;
  return {
    daysByDigit: rule.daysByDigit,
    allowedWindows: rule.allowedWindows,
    summary: rule.summary,
  };
}

/**
 * Can Driplin judge this property at all under this stage? False when
 * the city's schedule is unknown outright, or when the meter has no
 * street address and the city publishes no rule for that case.
 */
export function canJudge(rule: StageRule, profile: PropertyProfile): boolean {
  if (rule.scheduleUnknown) return false;
  if (profile.noStreetAddress && !rule.noAddressSchedule) return false;
  return true;
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
 * One documented trigger level: a reading below `below` historically
 * corresponds to `stage`. Declaring these as data (rather than burying
 * them in an if-chain) lets the trend projection ask "which threshold
 * would we cross next?" for any city, without knowing the city.
 */
export interface IndicatorThreshold {
  stage: DroughtStage;
  below: number;
}

/**
 * Which stage a reading corresponds to, given a city's thresholds.
 * Most severe matching stage wins; no match means stage 0.
 */
export function stageFromThresholds(
  thresholds: IndicatorThreshold[],
  value: number
): DroughtStage {
  return thresholds
    .filter((t) => value < t.below)
    .reduce<DroughtStage>((worst, t) => (t.stage > worst ? t.stage : worst), 0);
}

/**
 * The next trigger level a falling reading would cross: the highest
 * threshold still below the current value. Null when the reading is
 * already past every documented level.
 */
export function nextThresholdBelow(
  thresholds: IndicatorThreshold[],
  value: number
): IndicatorThreshold | null {
  const candidates = thresholds.filter((t) => t.below < value);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.below > a.below ? b : a));
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
  /** Documented trigger levels for this city, most severe lowest. */
  thresholds: IndicatorThreshold[];
  /** Which stage this reading historically corresponds to. */
  suggestStage(value: number): DroughtStage;
  fetchReading(): Promise<IndicatorReading>;
  /** Why a single crossing isn't a stage change; shown in the alert. */
  caveat: string;
  /** How to phrase a projected crossing, e.g. "falling toward". */
  decliningVerb?: string;
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
