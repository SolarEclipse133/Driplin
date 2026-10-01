/**
 * Deciding whether there is time for one more organization.
 *
 * The nightly job ran every organization in one serverless invocation with
 * no idea how long it had. Past the function's limit it was simply killed:
 * finishRun never ran, and every organization after the cut was never
 * checked at all -- silently, and because the ordering was stable, the
 * SAME ones every night.
 *
 * Two safety nets did eventually catch it. The heartbeat sees no completed
 * run, and a cache nobody refreshed goes stale after three nights and
 * reports "not being checked". So it surfaces rather than lying. But for
 * up to three nights, real customers are unmonitored while believing they
 * are covered, which is the failure this product exists to prevent.
 *
 * So the run now knows its deadline, stops while it can still tidy up,
 * and says who it did not reach.
 */

export interface BudgetState {
  /** When the run began. */
  startedAt: number;
  /** Total time the platform allows. */
  limitMs: number;
  /**
   * Time held back for the work that must happen after the loop --
   * closing the run record, raising an alert about what was skipped.
   * Spending the whole budget on organizations is how a run ends with no
   * record of having ended.
   */
  reserveMs: number;
}

export interface BudgetVerdict {
  proceed: boolean;
  /** Said plainly, for the run record and the alert. */
  reason: string;
  msRemaining: number;
}

/**
 * Is there time for another organization?
 *
 * The estimate comes from the organizations already done in THIS run,
 * because the honest predictor of how long the next one takes is how long
 * the last ones took -- on this platform, this night, with these vendors
 * responding at whatever speed they are responding at.
 */
export function canProcessAnother(
  state: BudgetState,
  now: number,
  orgsDone: number,
  /** A first guess before anything has been measured. */
  firstGuessMs = 5_000
): BudgetVerdict {
  const elapsed = now - state.startedAt;
  const msRemaining = state.limitMs - state.reserveMs - elapsed;

  if (msRemaining <= 0) {
    return {
      proceed: false,
      reason: "out of time",
      msRemaining: Math.max(0, msRemaining),
    };
  }

  // Nothing measured yet: back the first guess rather than refusing to
  // start, which would mean never checking anyone.
  const estimate = orgsDone === 0 ? firstGuessMs : elapsed / orgsDone;

  if (estimate > msRemaining) {
    return {
      proceed: false,
      reason: `not enough time for another organization (about ${Math.round(estimate / 1000)}s needed, ${Math.round(msRemaining / 1000)}s left)`,
      msRemaining,
    };
  }

  return { proceed: true, reason: "within budget", msRemaining };
}

/**
 * Always attempt the first organization, whatever the arithmetic says.
 *
 * A run that checks nobody is worse than one that overruns: the overrun
 * is caught by the heartbeat, while checking nobody, night after night,
 * looks exactly like a working system.
 */
export function mustTryFirst(orgsDone: number): boolean {
  return orgsDone === 0;
}
