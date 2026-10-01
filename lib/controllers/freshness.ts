/**
 * How old a cached schedule may be before Driplin stops believing it.
 *
 * When a sync fails, the cached schedule is kept on purpose: evaluating
 * last night's copy is better than evaluating nothing, and one flaky
 * request should not blank a dashboard. That reasoning holds for a few
 * hours and then quietly stops holding.
 *
 * A customer rotates their vendor API key, revokes Driplin's access, or
 * the controller drops off the network. Every sync fails from then on.
 * The cache is frozen at whatever it last said -- and if that was
 * compliant, Driplin goes on reporting compliant indefinitely, from a
 * copy that is now months old, about hardware it can no longer see.
 *
 * That is the exact failure this product is sold to prevent, and worse
 * than being silent, because the dashboard actively reassures.
 *
 * So the cache has a shelf life. Past it there is no judgement: the
 * controller is unknown, loudly, until Driplin can read it again.
 */

/**
 * Three days.
 *
 * The nightly job gives one chance to recover per night, and Vercel's
 * scheduler can drift across an hour, so one night's grace is too tight
 * -- a single missed run would blank a healthy portfolio. Three nights is
 * long enough that a transient outage recovers on its own, and short
 * enough that nobody waters illegally for a week behind a green badge.
 */
export const SCHEDULE_STALE_AFTER_HOURS = 72;

export type ScheduleFreshness =
  | { usable: true; ageHours: number | null }
  | { usable: false; reason: "never_read" | "stale"; ageHours: number | null };

/**
 * May Driplin judge this controller against its cached schedule?
 *
 * `fetchedAt` is when the cache was last successfully filled -- not when
 * compliance last ran, which happens whether or not the read worked.
 */
export function scheduleFreshness(
  fetchedAt: string | null,
  now: number = Date.now()
): ScheduleFreshness {
  if (!fetchedAt) {
    // Nothing has ever been read from this controller. Not stale --
    // simply unknown, which reads differently to a customer and needs a
    // different fix.
    return { usable: false, reason: "never_read", ageHours: null };
  }

  const parsed = Date.parse(fetchedAt);
  if (Number.isNaN(parsed)) {
    return { usable: false, reason: "never_read", ageHours: null };
  }

  const ageHours = (now - parsed) / 3_600_000;
  // A clock skew that puts the cache slightly in the future is not a
  // reason to distrust it.
  if (ageHours > SCHEDULE_STALE_AFTER_HOURS) {
    return { usable: false, reason: "stale", ageHours };
  }
  return { usable: true, ageHours };
}

/** Plain words for a dashboard, an alert or a board report. */
export function describeStaleness(
  freshness: ScheduleFreshness,
  vendorLabel: string
): string {
  if (freshness.usable) return "";
  if (freshness.reason === "never_read") {
    return `Driplin has never been able to read this controller, so it cannot say whether its schedule is legal.`;
  }
  const days = Math.floor((freshness.ageHours ?? 0) / 24);
  return `Driplin has not been able to read this controller for ${days} day${days === 1 ? "" : "s"}. Its ${vendorLabel} connection is probably broken — the schedule shown is the last one Driplin saw and may no longer be what the controller is doing.`;
}
