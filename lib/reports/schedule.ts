/**
 * When a board report is due.
 *
 * Pure, so the "is it time yet" decision can be tested without a
 * database or a clock. The nightly job asks this for every
 * organization; anything it says yes to gets a report per property.
 */

export type ReportFrequency = "off" | "monthly" | "quarterly";

/** How many days between reports at each cadence. */
const INTERVAL_DAYS: Record<Exclude<ReportFrequency, "off">, number> = {
  monthly: 30,
  quarterly: 90,
};

export interface ReportSchedule {
  frequency?: string | null;
  reports_last_sent_at?: string | null;
}

export function isReportDue(
  schedule: ReportSchedule,
  now: number = Date.now()
): boolean {
  const frequency = (schedule.frequency ?? "quarterly") as ReportFrequency;
  if (frequency === "off") return false;

  // Never sent: due now. A new customer should see the thing that sells
  // the product, not wait a quarter to discover it exists.
  if (!schedule.reports_last_sent_at) return true;

  const last = Date.parse(schedule.reports_last_sent_at);
  if (!Number.isFinite(last)) return true;

  const elapsedDays = (now - last) / 86_400_000;
  return elapsedDays >= INTERVAL_DAYS[frequency];
}

/** The period a report sent now should cover. */
export function reportPeriod(
  schedule: ReportSchedule,
  now: number = Date.now()
): { from: Date; to: Date } {
  const frequency = (schedule.frequency ?? "quarterly") as ReportFrequency;
  const days = frequency === "off" ? 90 : INTERVAL_DAYS[frequency];
  return {
    from: new Date(now - days * 86_400_000),
    to: new Date(now),
  };
}
