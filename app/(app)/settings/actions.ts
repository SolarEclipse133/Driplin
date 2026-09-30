"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, sendSms, type SendResult } from "@/lib/notifications/senders";

export type SettingsState = { error: string | null; success: string | null };

/** US phone in E.164, e.g. +15125551234 (what Twilio needs). */
const PHONE_RE = /^\+1[0-9]{10}$/;

export async function updateProfile(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  if (!fullName) return { error: "Please enter your name.", success: null };

  // Normalize common phone formats to +1XXXXXXXXXX; empty clears it.
  let phone: string | null = null;
  if (phoneRaw) {
    const digits = phoneRaw.replace(/[^0-9]/g, "");
    const normalized =
      digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : phoneRaw;
    if (!PHONE_RE.test(normalized))
      return {
        error: "Enter a US phone number like (512) 555-1234, or leave it blank.",
        success: null,
      };
    phone = normalized;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are no longer signed in.", success: null };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone })
    .eq("id", user.id);
  if (error) return { error: "Could not save your settings.", success: null };

  revalidatePath("/settings");
  return {
    error: null,
    success: phone
      ? "Saved. Compliance alerts will be texted to your phone and emailed."
      : "Saved. Compliance alerts will be emailed (no phone number set).",
  };
}

export type TestNotificationState = {
  error: string | null;
  results: { channel: string; recipient: string; outcome: string; detail: string | null }[];
};

/**
 * Send a real alert to yourself, right now.
 *
 * Without this, the only way to find out whether delivery works is to
 * wait for a property to go out of compliance — which is exactly the
 * moment you do not want to discover that Twilio is on a trial plan
 * that refuses custom messages. It goes through the same senders and
 * the same log as a real alert, so a pass here means a real alert
 * would arrive too.
 */
export async function sendTestNotification(
  _prev: TestNotificationState,
  _formData: FormData
): Promise<TestNotificationState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are no longer signed in.", results: [] };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, email, phone, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return { error: "Your account has no organization.", results: [] };

  const email = profile.email ?? user.email ?? null;
  const phone = profile.phone ?? null;
  if (!email && !phone)
    return {
      error: "Add an email address or mobile number above first.",
      results: [],
    };

  const who = profile.full_name?.trim() || "there";
  const subject = "Driplin: test alert";
  const body =
    `Hi ${who} — this is a test from Driplin.\n\n` +
    `If you are reading this, real compliance alerts will reach you the same way.\n\n` +
    `— Driplin drought compliance`;

  const results: TestNotificationState["results"] = [];

  const record = async (
    channel: "email" | "sms",
    recipient: string,
    result: SendResult,
    sentBody: string,
    sentSubject: string | null
  ) => {
    await supabase.from("notification_log").insert({
      alert_id: null,
      org_id: profile.org_id,
      channel,
      recipient,
      subject: sentSubject,
      body: sentBody,
      status: result.status,
      error: result.status === "failed" ? result.error : null,
    });
    results.push({
      channel,
      recipient,
      outcome: result.status,
      detail: result.status === "failed" ? result.error : null,
    });
  };

  if (email) await record("email", email, await sendEmail(email, subject, body), body, subject);
  if (phone) {
    const smsBody = "Driplin: test alert. Real compliance alerts will reach you this way.";
    await record("sms", phone, await sendSms(phone, smsBody), smsBody, null);
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { error: null, results };
}

export type ReportSettingsState = { error: string | null; success: string | null };

/** How often this company's board reports go out. */
export async function setReportFrequency(
  _prev: ReportSettingsState,
  formData: FormData
): Promise<ReportSettingsState> {
  const frequency = String(formData.get("report_frequency") ?? "");
  if (!["off", "monthly", "quarterly"].includes(frequency))
    return { error: "Pick how often reports should go out.", success: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are no longer signed in.", success: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile?.org_id)
    return { error: "Your account has no organization.", success: null };

  const { error } = await supabase
    .from("organizations")
    .update({ report_frequency: frequency })
    .eq("id", profile.org_id);
  if (error) return { error: "Could not save that setting.", success: null };

  revalidatePath("/settings");
  return {
    error: null,
    success:
      frequency === "off"
        ? "Board reports turned off. You can still download one any time from a property."
        : `Board reports will go out ${frequency}, one per property, to everyone on this account.`,
  };
}
