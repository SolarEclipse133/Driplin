import { describe, expect, it } from "vitest";
import { isReportDue, reportPeriod } from "./schedule";

/**
 * When a board report is due.
 *
 * The failure to avoid is emailing a board the same report twice —
 * it makes the sender look careless in front of the manager's own
 * client, which is the relationship the report exists to protect.
 */

const NOW = Date.parse("2026-09-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("cadence", () => {
  it.each([
    ["quarterly", 89, false],
    ["quarterly", 90, true],
    ["quarterly", 200, true],
    ["monthly", 29, false],
    ["monthly", 30, true],
    ["monthly", 45, true],
  ])("%s, last sent %i days ago -> due %s", (frequency, days, expected) => {
    expect(isReportDue({ frequency, reports_last_sent_at: daysAgo(days) }, NOW)).toBe(expected);
  });

  it("off means never", () => {
    expect(isReportDue({ frequency: "off", reports_last_sent_at: daysAgo(999) }, NOW)).toBe(false);
  });

  it("defaults to quarterly when unset", () => {
    expect(isReportDue({ reports_last_sent_at: daysAgo(91) }, NOW)).toBe(true);
    expect(isReportDue({ reports_last_sent_at: daysAgo(10) }, NOW)).toBe(false);
  });
});

describe("a customer who has never had one", () => {
  it("is due immediately rather than waiting a quarter", () => {
    expect(isReportDue({ frequency: "quarterly", reports_last_sent_at: null }, NOW)).toBe(true);
  });

  it("is still not due if reports are switched off", () => {
    expect(isReportDue({ frequency: "off", reports_last_sent_at: null }, NOW)).toBe(false);
  });

  it("treats an unparseable timestamp as never sent", () => {
    expect(isReportDue({ frequency: "monthly", reports_last_sent_at: "not a date" }, NOW)).toBe(true);
  });
});

describe("the period a report covers", () => {
  it("matches the cadence", () => {
    const quarterly = reportPeriod({ frequency: "quarterly" }, NOW);
    expect(Math.round((quarterly.to.getTime() - quarterly.from.getTime()) / 86_400_000)).toBe(90);

    const monthly = reportPeriod({ frequency: "monthly" }, NOW);
    expect(Math.round((monthly.to.getTime() - monthly.from.getTime()) / 86_400_000)).toBe(30);
  });

  it("ends now", () => {
    expect(reportPeriod({ frequency: "monthly" }, NOW).to.getTime()).toBe(NOW);
  });
});
