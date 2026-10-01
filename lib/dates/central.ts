/**
 * Turning a Central calendar date into a real instant.
 *
 * Every date a Driplin customer types is a Central one -- the cities whose
 * rules this product enforces are all in America/Chicago, and the board
 * reports are read by people on that clock.
 *
 * The report endpoint used to do this with a fixed offset:
 *
 *   new Date(`${to}T23:59:59-06:00`)
 *
 * -06:00 is CST. Central is CDT, -05:00, from mid-March to early
 * November, so for roughly eight months of the year that expression named
 * an instant an hour later than the customer meant. The whole reporting
 * window slid: compliance events in the first hour of the "from" day were
 * silently missing from the report, and events from the first hour of the
 * day AFTER "to" were included in it.
 *
 * A board report that quietly omits a compliance event is a defective
 * audit record, which is the one thing this product cannot be.
 *
 * So the offset is asked for rather than assumed, per date, from the
 * zone database the runtime already ships.
 */

export const CENTRAL = "America/Chicago";

/**
 * How far Central is from UTC at a given instant, in minutes.
 *
 * Found by formatting the instant into Central wall-clock fields and
 * seeing how far they are from the UTC ones -- which is the only way to
 * ask the zone database a question like this without a dependency.
 */
function offsetMinutesAt(instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));

  const field = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  // Intl renders midnight as hour 24 in some ICU versions.
  const hour = field("hour") % 24;

  const wallAsIfUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    hour,
    field("minute"),
    field("second")
  );
  return (wallAsIfUtc - instant) / 60_000;
}

/**
 * The instant at which Central wall-clock time reads as given.
 *
 * Two passes, because the offset depends on the answer: guess by assuming
 * UTC, ask what the offset is there, correct, then confirm. The second
 * pass is what makes the clock-change days come out right.
 *
 * On the spring-forward day the 2am hour does not exist; a time inside it
 * resolves to the instant the clocks jump to, which is the only sensible
 * reading of a wall time that never happened. On the fall-back day 1am
 * happens twice and this returns the FIRST, matching how a person reading
 * "1:30am" would normally mean the earlier one.
 */
export function centralWallTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const wallAsIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);

  let instant = wallAsIfUtc - offsetMinutesAt(wallAsIfUtc) * 60_000;
  // Re-ask at the corrected instant: near a transition the first guess
  // can land on the wrong side of it.
  instant = wallAsIfUtc - offsetMinutesAt(instant) * 60_000;

  return new Date(instant);
}

/** Does this look like a date a person typed, YYYY-MM-DD? */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Reject the 31st of a 30-day month rather than rolling into the next.
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** The first instant of a Central calendar date. Null if unparseable. */
export function startOfCentralDay(date: string): Date | null {
  if (!isCalendarDate(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  return centralWallTimeToInstant(y, m, d, 0, 0, 0);
}

/**
 * The last instant of a Central calendar date.
 *
 * Taken as the moment before the next day begins, rather than 23:59:59,
 * so nothing recorded in the final second of the day falls outside the
 * period. On a spring-forward day the day is 23 hours long and this still
 * lands correctly, because it is derived from the next day's start.
 */
export function endOfCentralDay(date: string): Date | null {
  const start = startOfCentralDay(date);
  if (!start) return null;
  const [y, m, d] = date.split("-").map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStart = centralWallTimeToInstant(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    0,
    0,
    0
  );
  return new Date(nextStart.getTime() - 1);
}

/**
 * Today's date in Central, as YYYY-MM-DD.
 *
 * Needed wherever code asks "has this date passed?". Deriving that from
 * the UTC date is wrong every evening: after 7pm Central, UTC is already
 * on tomorrow, so anything expiring today reads as expired hours early.
 */
export function centralCalendarDate(instant: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CENTRAL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const field = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${field("year")}-${field("month")}-${field("day")}`;
}

/** Whole days from today (Central) to a calendar date; negative if past. */
export function daysFromTodayCentral(
  date: string,
  now: number = Date.now()
): number {
  const target = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${centralCalendarDate(now)}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}
