import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { BoardReport } from "./board-report";
import { gatherReportData } from "./gather";
import { isReportDue, reportPeriod } from "./schedule";
import { sendEmail } from "@/lib/notifications/senders";

/**
 * Emails every due organization its board reports.
 *
 * Runs inside the nightly job. Deliberately conservative: it sends at
 * most one round per organization per cadence, records the send before
 * anything can go wrong twice, and skips silently when email is not
 * configured rather than filling the log with failures nobody asked
 * for.
 */

export interface ReportRunSummary {
  organizationsDue: number;
  reportsSent: number;
  failures: number;
  skipped: string | null;
}

/** Keep one nightly run bounded; a huge portfolio spills to tomorrow. */
const MAX_PROPERTIES_PER_RUN = 25;

export async function sendScheduledReports(
  supabase: SupabaseClient,
  now: number = Date.now()
): Promise<ReportRunSummary> {
  if (!process.env.RESEND_API_KEY) {
    return {
      organizationsDue: 0,
      reportsSent: 0,
      failures: 0,
      skipped: "email is not configured",
    };
  }

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, report_frequency, reports_last_sent_at");

  const due = (orgs ?? []).filter((o) =>
    isReportDue(
      {
        frequency: o.report_frequency as string | null,
        reports_last_sent_at: o.reports_last_sent_at as string | null,
      },
      now
    )
  );

  let reportsSent = 0;
  let failures = 0;

  for (const org of due) {
    const { from, to } = reportPeriod(
      { frequency: org.report_frequency as string | null },
      now
    );

    const [{ data: properties }, { data: members }] = await Promise.all([
      supabase.from("properties").select("id, name").eq("org_id", org.id).limit(MAX_PROPERTIES_PER_RUN),
      supabase.from("profiles").select("email").eq("org_id", org.id),
    ]);

    const recipients = (members ?? [])
      .map((m) => m.email as string | null)
      .filter((e): e is string => !!e);

    // Stamp the send BEFORE doing the work. If this run dies halfway,
    // the next night resumes at the next cadence rather than emailing
    // the same board a second copy of a report they already have.
    await supabase
      .from("organizations")
      .update({ reports_last_sent_at: new Date(now).toISOString() })
      .eq("id", org.id);

    if (recipients.length === 0 || (properties ?? []).length === 0) continue;

    for (const property of properties ?? []) {
      const data = await gatherReportData(supabase, property.id as string, from, to);
      if (!data) continue;

      let pdf: Buffer;
      try {
        pdf = await renderToBuffer(BoardReport({ data }));
      } catch {
        failures += 1;
        continue;
      }

      const filename = `driplin-${String(property.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
      const period = `${from.toLocaleDateString("en-US", { timeZone: "America/Chicago", dateStyle: "medium" })} to ${to.toLocaleDateString("en-US", { timeZone: "America/Chicago", dateStyle: "medium" })}`;
      const body = [
        `Attached is the drought compliance report for ${property.name}, covering ${period}.`,
        "",
        `Current status: ${data.stats.currentStatus}.`,
        `Checks run: ${data.stats.checksRun}. Corrections made automatically: ${data.stats.autoCorrections}.`,
        "",
        "It's ready to hand to a board as it is.",
        "",
        "— Driplin drought compliance",
      ].join("\n");

      for (const to_ of recipients) {
        const result = await sendEmail(
          to_,
          `Driplin compliance report — ${property.name}`,
          body,
          [{ filename, content: pdf.toString("base64") }]
        );
        await supabase.from("notification_log").insert({
          alert_id: null,
          org_id: org.id,
          channel: "email",
          recipient: to_,
          subject: `Driplin compliance report — ${property.name}`,
          body,
          status: result.status,
          error: result.status === "failed" ? result.error : null,
        });
        if (result.status === "sent") reportsSent += 1;
        else if (result.status === "failed") failures += 1;
      }
    }
  }

  return {
    organizationsDue: due.length,
    reportsSent,
    failures,
    skipped: null,
  };
}
