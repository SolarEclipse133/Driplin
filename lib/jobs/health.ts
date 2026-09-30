/**
 * Has the nightly job stopped?
 *
 * Pure, because this is the rule that decides whether Driplin admits
 * it has stopped working, and that deserves to be testable without a
 * database or a clock.
 */

export interface JobHealth {
  lastSuccessAt: string | null;
  hoursSinceSuccess: number | null;
  stale: boolean;
  /** Never run at all — a fresh deployment, not a failure. */
  neverRun: boolean;
  lastError: string | null;
}

/**
 * The job runs daily, so a longer gap means a run was missed. Vercel's
 * scheduler fires anywhere within its allotted hour, so the allowance
 * has to span two hour-wide windows plus a margin — otherwise a late
 * run followed by an early one would look like a failure and teach
 * everyone to ignore the warning.
 */
export const STALE_AFTER_HOURS = 30;

export function assessHealth(
  lastSuccessAt: string | null,
  lastError: string | null,
  neverRun: boolean,
  now: number = Date.now()
): JobHealth {
  if (neverRun) {
    // A deployment that has not reached its first night is not broken,
    // and crying wolf on day one teaches people to ignore the alarm.
    return {
      lastSuccessAt: null,
      hoursSinceSuccess: null,
      stale: false,
      neverRun: true,
      lastError: null,
    };
  }

  if (!lastSuccessAt) {
    // It has run, and has never once succeeded.
    return {
      lastSuccessAt: null,
      hoursSinceSuccess: null,
      stale: true,
      neverRun: false,
      lastError,
    };
  }

  const hours = (now - Date.parse(lastSuccessAt)) / 3_600_000;
  return {
    lastSuccessAt,
    hoursSinceSuccess: hours,
    stale: hours > STALE_AFTER_HOURS,
    neverRun: false,
    lastError,
  };
}
