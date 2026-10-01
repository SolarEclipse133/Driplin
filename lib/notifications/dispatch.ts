/**
 * Alert dispatch: composes the SMS and email for an alert, sends them
 * through the provider layer (or logs them in log-only mode), records
 * every message in notification_log, and stamps the alert.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, sendSms } from "./senders";
import { recipientsFor } from "./recipients";

/**
 * Every kind of alert Driplin sends.
 *
 * Kept in one place and used as the key of SUBJECTS below, so adding a
 * kind without giving it a subject line is a type error rather than an
 * email with no subject. It was the latter: the alerts added for lapsing
 * variances, unanswered work orders and unreadable controllers all
 * reached Resend with `subject: undefined`, because rows read back from
 * Supabase are typed loosely enough to slip past this.
 */
export type AlertType =
  | "violation"
  | "push_failed"
  | "lcra_threshold"
  | "early_warning"
  | "variance_expiring"
  | "work_order_stale"
  | "controller_unreadable"
  | "stage_change";

interface AlertRow {
  id: string;
  org_id: string | null;
  /** Used to route the alert to whoever is responsible for it. */
  property_id?: string | null;
  type: AlertType | string;
  message: string;
  details?: unknown;
  /** Overrides the subject line, for an alert that composes its own. */
  subject?: string;
}

function emailBodyFor(alert: AlertRow): string {
  // An alert that composed its own body keeps it. A stage-change digest
  // is a written message, not a one-line alert with steps appended.
  const own = (alert.details as { emailBody?: string } | null)?.emailBody;
  if (own) return `${own}\n\n— Driplin drought compliance`;

  const lines = [alert.message, ""];
  const instructions = (
    alert.details as { manualInstructions?: string[] } | null
  )?.manualInstructions;
  if (instructions?.length) {
    lines.push("What to change:");
    instructions.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push("");
  }
  lines.push("— Driplin drought compliance");
  return lines.join("\n");
}

const SUBJECTS: Record<AlertType, string> = {
  violation: "Driplin: watering schedule corrected",
  push_failed: "Driplin: property needs a manual schedule fix",
  lcra_threshold: "Driplin admin: LCRA reading needs stage verification",
  early_warning: "Driplin admin: water supply approaching a threshold",
  variance_expiring: "Driplin: a watering variance is about to expire",
  work_order_stale: "Driplin: a work order has not been acted on",
  controller_unreadable: "Driplin: a property is not being checked",
  stage_change: "Driplin: your city has changed its watering rules",
};

/** Never send an email with no subject, whatever arrives here. */
function subjectFor(alert: AlertRow): string {
  if (alert.subject) return alert.subject;
  return (
    SUBJECTS[alert.type as AlertType] ??
    "Driplin: your properties need attention"
  );
}

/**
 * For org alerts: notify every member of the org (email always, SMS if
 * they've set a phone). For internal alerts (org_id null): email the
 * ADMIN_ALERT_EMAIL address, or every admin profile as fallback.
 */
export async function dispatchAlertNotifications(
  supabase: SupabaseClient,
  alert: AlertRow
): Promise<void> {
  const subject = subjectFor(alert);
  const emailBody = emailBodyFor(alert);
  // SMS must stay short.
  const smsBody = `Driplin: ${alert.message}`.slice(0, 320);

  let emailRecipients: string[] = [];
  let smsRecipients: string[] = [];

  if (alert.org_id) {
    const { data: members } = await supabase
      .from("profiles")
      .select("id, email, phone")
      .eq("org_id", alert.org_id);

    // Route to whoever owns this property, if anyone does. See
    // ./recipients: narrowing the audience must never empty it.
    let assigneeId: string | null = null;
    if (alert.property_id) {
      const { data: property } = await supabase
        .from("properties")
        .select("assigned_to")
        .eq("id", alert.property_id)
        .maybeSingle();
      assigneeId = (property?.assigned_to as string | null) ?? null;
    }

    const routed = recipientsFor(members ?? [], assigneeId);
    emailRecipients = routed.email;
    smsRecipients = routed.sms;
  } else {
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    if (adminEmail) {
      emailRecipients = [adminEmail];
    } else {
      const { data: admins } = await supabase
        .from("profiles")
        .select("email")
        .eq("role", "admin");
      emailRecipients = (admins ?? [])
        .map((a) => a.email)
        .filter((e): e is string => !!e);
    }
  }

  let anyEmailSent = false;
  let anySmsSent = false;

  for (const to of emailRecipients) {
    const result = await sendEmail(to, subject, emailBody);
    if (result.status === "sent") anyEmailSent = true;
    await supabase.from("notification_log").insert({
      alert_id: alert.id,
      org_id: alert.org_id,
      channel: "email",
      recipient: to,
      subject,
      body: emailBody,
      status: result.status,
      error: result.status === "failed" ? result.error : null,
    });
  }

  for (const to of smsRecipients) {
    const result = await sendSms(to, smsBody);
    if (result.status === "sent") anySmsSent = true;
    await supabase.from("notification_log").insert({
      alert_id: alert.id,
      org_id: alert.org_id,
      channel: "sms",
      recipient: to,
      subject: null,
      body: smsBody,
      status: result.status,
      error: result.status === "failed" ? result.error : null,
    });
  }

  if (anyEmailSent || anySmsSent) {
    await supabase
      .from("alerts")
      .update({ email_sent: anyEmailSent, sms_sent: anySmsSent })
      .eq("id", alert.id);
  }
}
