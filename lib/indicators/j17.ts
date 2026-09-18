/**
 * Edwards Aquifer J-17 index well reader (San Antonio's leading
 * indicator).
 *
 * The Edwards Aquifer Authority publishes the J-17 level on
 * edwardsaquifer.org, including a "10 DAY AVERAGE" panel — and the
 * 10-day average is what SAWS drought-stage triggers are defined on,
 * so that is the figure we read.
 *
 * FRAGILITY NOTE: the EAA offers no public API, so this parses their
 * page. That is acceptable here only because this value never changes
 * anything by itself — it just suggests a stage for a human to verify.
 * If the markup changes, the parse fails loudly, the admin panel shows
 * the error, and stage confirmation continues to work by hand.
 */

import { IndicatorReading } from "@/lib/jurisdictions/types";

const EAA_URL = "https://www.edwardsaquifer.org/";

export class IndicatorError extends Error {}

export async function fetchJ17TenDayAverage(): Promise<IndicatorReading> {
  let res: Response;
  try {
    res = await fetch(EAA_URL, { cache: "no-store" });
  } catch {
    throw new IndicatorError(
      "Could not reach the Edwards Aquifer Authority site (network error)."
    );
  }
  if (!res.ok) {
    throw new IndicatorError(
      `Edwards Aquifer Authority site returned HTTP ${res.status}.`
    );
  }

  // Work on tag-stripped text: attribute values carry digits of their
  // own (style="color:#000") that would otherwise be read as data.
  const text = (await res.text())
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");

  // The page shows today's reading as "Bexar J-17 638.1 FT. AMSL" and
  // the 10-day average as "J-17 Well 640.5 FT. AMSL" inside the
  // "10 DAY AVERAGE" panel. SAWS triggers are defined on the 10-day
  // average, so match the "J-17 Well" label specifically — and require
  // the 10-day-average heading just before it, so a layout change that
  // moves this label can't silently feed us the wrong number.
  const match = text.match(/J-17\s*Well[^0-9]{0,20}([0-9]{3}(?:\.[0-9]+)?)\s*FT/i);
  if (!match) {
    throw new IndicatorError(
      "Could not find the J-17 10-day average on the Edwards Aquifer page (their layout may have changed)."
    );
  }
  const preceding = text.slice(Math.max(0, match.index! - 200), match.index!);
  if (!/10\s*DAY\s*AVERAGE/i.test(preceding)) {
    throw new IndicatorError(
      "Found a J-17 figure on the Edwards Aquifer page but not under the 10-day average heading; refusing to use it."
    );
  }

  const value = Number(match[1]);
  // Sanity band: the J-17 record ranges roughly 610–705 ft AMSL.
  if (!Number.isFinite(value) || value < 500 || value > 800) {
    throw new IndicatorError(
      `Parsed an implausible J-17 level: ${match[1]} ft.`
    );
  }

  return {
    value,
    displayText: `${value} ft above mean sea level (10-day average)`,
    rawText: `Edwards Aquifer Authority, J-17 index well 10-day average: ${value} ft AMSL`,
    readAt: new Date().toISOString(),
  };
}
