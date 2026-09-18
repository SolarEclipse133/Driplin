/**
 * Alert dispatch: composes the SMS and email for an alert, sends them
 * through the provider layer (or logs them in log-only mode), records
 * every message in notification_log, and stamps the alert.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, sendSms } from "./senders";

interface AlertRow {
  id: string;
  org_id: string | null;
  type: "violation" | "push_failed" | "lcra_threshold";
  message: string;
  details?: unknown;
}

function emailBodyFor(alert: AlertRow): string {
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

const SUBJECTS: Record<AlertRow["type"], string> = {
  violation: "Driplin: watering schedule corrected",
  push_failed: "Driplin: property needs a manual schedule fix",
  lcra_threshold: "Driplin admin: LCRA reading needs stage verification",
};

/**
 * For org alerts: notify every member of the org (email always, SMS if
 * they've set a phone). For internal alerts (org_id null): email the
 * ADMIN_ALERT_EMAIL address, or every admin profile as fallback.
 */
export async function dispatchAlertNotifications(
  supabase: SupabaseClient,
  alert: AlertRow
): Promise<void> {
  const subject = SUBJECTS[alert.type];
  const emailBody = emailBodyFor(alert);
  // SMS must stay short.
  const smsBody = `Driplin: ${alert.message}`.slice(0, 320);

  let emailRecipients: string[] = [];
  let smsRecipients: string[] = [];

  if (alert.org_id) {
    const { data: members } = await supabase
      .from("profiles")
      .select("email, phone")
      .eq("org_id", alert.org_id);
    emailRecipients = (members ?? [])
      .map((m) => m.email)
      .filter((e): e is string => !!e);
    smsRecipients = (members ?? [])
      .map((m) => m.phone)
      .filter((p): p is string => !!p);
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
