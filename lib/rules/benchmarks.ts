/**
 * How long a property takes to act when Driplin says something needs
 * changing by hand.
 *
 * The measurement only exists for manual fixes. When Driplin can push
 * a corrected schedule itself the property never waits on anybody, so
 * it has no response time at all — an absence here is the good case,
 * and the UI has to say so or the ranking reads as a list of gaps.
 *
 * WHAT THE CLOCK MEASURES
 *
 * A controller that can't be corrected remotely gets a `push_failed`
 * event on EVERY compliance run while it stays broken — so the most
 * recent one is just last night's check, not when the problem began.
 * The clock has to start at the FIRST failure of the current run of
 * failures: the moment the property was actually asked to do
 * something. Everything below is built around that.
 *
 * A confirmation that Driplin then re-checked and found still wrong
 * does not stop the clock. Someone saying "done" is not the same as
 * it being done, and a ranking that counted it would reward the
 * wrong thing.
 */

export interface FlagEvent {
  controllerId: string;
  /** ISO timestamp of a push_failed event. */
  at: string;
}

export interface ConfirmationEvent {
  controllerId: string | null;
  propertyId: string;
  at: string;
  /** true = Driplin re-read the controller and it matched. */
  verified: boolean | null;
}

export interface ControllerState {
  id: string;
  propertyId: string;
  needsManualFix: boolean;
}

export interface PropertyResponse {
  propertyId: string;
  name: string;
  /** Episodes that ended in a verified fix. */
  fixes: number;
  averageHours: number | null;
  slowestHours: number | null;
  fastestHours: number | null;
  /** Controllers at this property waiting on a hand-fix right now. */
  openCount: number;
  oldestOpenHours: number | null;
  /** Confirmations that didn't hold up when re-checked. */
  unverifiedAttempts: number;
}

export interface BenchmarkSummary {
  /** Properties with at least one completed fix, slowest first. */
  ranked: PropertyResponse[];
  /** Properties waiting right now but with nothing completed yet. */
  waitingOnly: PropertyResponse[];
  portfolioAverageHours: number | null;
  totalFixes: number;
  openNow: number;
}

const HOUR = 1000 * 60 * 60;

function hoursBetween(startIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(startIso)) / HOUR;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/**
 * Walk one controller's history and return the length, in hours, of
 * every episode that ended in a verified fix — plus how long the
 * current episode has been open, if one is.
 */
function measureController(
  flags: FlagEvent[],
  confirmations: ConfirmationEvent[],
  needsManualFix: boolean,
  now: number
): { durations: number[]; openHours: number | null; unverified: number } {
  const sortedFlags = [...flags].sort((a, b) => a.at.localeCompare(b.at));
  const sortedConfirmations = [...confirmations].sort((a, b) =>
    a.at.localeCompare(b.at)
  );

  const durations: number[] = [];
  let unverified = 0;
  // Everything before this instant belongs to an episode already
  // closed out; the next episode can only start after it.
  let resolvedThrough: string | null = null;

  const firstFlagAfter = (since: string | null, before: string | null) =>
    sortedFlags.find(
      (f) =>
        (since === null || f.at > since) && (before === null || f.at <= before)
    ) ?? null;

  for (const confirmation of sortedConfirmations) {
    const start = firstFlagAfter(resolvedThrough, confirmation.at);
    // A confirmation with no preceding failure has no clock to stop —
    // someone confirming a controller nobody flagged.
    if (!start) continue;

    if (confirmation.verified === true) {
      durations.push(hoursBetween(start.at, confirmation.at));
      resolvedThrough = confirmation.at;
    } else {
      // Claimed but not confirmed by re-check, or unreachable. The
      // episode stays open and its clock keeps running.
      unverified += 1;
    }
  }

  // Still waiting? Measure from the start of the run of failures that
  // has not been resolved.
  let openHours: number | null = null;
  if (needsManualFix) {
    const start = firstFlagAfter(resolvedThrough, null);
    if (start) openHours = (now - Date.parse(start.at)) / HOUR;
  }

  return { durations, openHours, unverified };
}

export function buildBenchmarks({
  properties,
  controllers,
  flags,
  confirmations,
  now = Date.now(),
}: {
  properties: { id: string; name: string }[];
  controllers: ControllerState[];
  flags: FlagEvent[];
  confirmations: ConfirmationEvent[];
  now?: number;
}): BenchmarkSummary {
  const flagsByController = groupBy(flags, (f) => f.controllerId);
  const confirmationsByController = groupBy(
    confirmations.filter(
      (c): c is ConfirmationEvent & { controllerId: string } =>
        c.controllerId !== null
    ),
    (c) => c.controllerId
  );

  const byProperty = new Map<string, PropertyResponse>();
  for (const p of properties) {
    byProperty.set(p.id, {
      propertyId: p.id,
      name: p.name,
      fixes: 0,
      averageHours: null,
      slowestHours: null,
      fastestHours: null,
      openCount: 0,
      oldestOpenHours: null,
      unverifiedAttempts: 0,
    });
  }

  const durationsByProperty = new Map<string, number[]>();

  for (const controller of controllers) {
    const row = byProperty.get(controller.propertyId);
    if (!row) continue;

    const { durations, openHours, unverified } = measureController(
      flagsByController.get(controller.id) ?? [],
      confirmationsByController.get(controller.id) ?? [],
      controller.needsManualFix,
      now
    );

    const all = durationsByProperty.get(controller.propertyId) ?? [];
    all.push(...durations);
    durationsByProperty.set(controller.propertyId, all);

    row.unverifiedAttempts += unverified;
    if (openHours !== null) {
      row.openCount += 1;
      row.oldestOpenHours = Math.max(row.oldestOpenHours ?? 0, openHours);
    }
  }

  for (const [propertyId, durations] of durationsByProperty) {
    const row = byProperty.get(propertyId);
    if (!row || durations.length === 0) continue;
    row.fixes = durations.length;
    row.averageHours =
      durations.reduce((sum, d) => sum + d, 0) / durations.length;
    row.slowestHours = Math.max(...durations);
    row.fastestHours = Math.min(...durations);
  }

  const rows = [...byProperty.values()];
  const ranked = rows
    .filter((r) => r.fixes > 0)
    // Slowest first: that is the row a manager needs to act on.
    .sort((a, b) => (b.averageHours ?? 0) - (a.averageHours ?? 0));
  const waitingOnly = rows
    .filter((r) => r.fixes === 0 && r.openCount > 0)
    .sort((a, b) => (b.oldestOpenHours ?? 0) - (a.oldestOpenHours ?? 0));

  const everyDuration = [...durationsByProperty.values()].flat();
  const portfolioAverageHours =
    everyDuration.length > 0
      ? everyDuration.reduce((sum, d) => sum + d, 0) / everyDuration.length
      : null;

  return {
    ranked,
    waitingOnly,
    portfolioAverageHours,
    totalFixes: everyDuration.length,
    openNow: rows.reduce((sum, r) => sum + r.openCount, 0),
  };
}

/** "40m", "18h", "3.2 days" — whichever reads honestly at that size. */
export function formatDuration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)} days`;
}
