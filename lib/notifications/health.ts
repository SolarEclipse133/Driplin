import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Is Driplin actually able to reach anyone?
 *
 * An alert that is composed, recorded, and never delivered is worse
 * than no alert at all: the manager believes they are covered. Both
 * states below are quiet failures unless something puts them in front
 * of the person who depends on them, which is why this is surfaced on
 * the dashboard and not only in Settings.
 */

export interface NotificationHealth {
  emailConfigured: boolean;
  smsConfigured: boolean;
  /** Deliveries the provider rejected in the recent window. */
  recentFailures: number;
  /** Messages only written to the log because no provider is set up. */
  recentLogged: number;
  /** The most useful provider error to show, if any. */
  lastError: string | null;
}

const WINDOW_DAYS = 7;

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function smsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

export async function getNotificationHealth(
  supabase: SupabaseClient
): Promise<NotificationHealth> {
  const since = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data } = await supabase
    .from("notification_log")
    .select("status, error, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  return {
    emailConfigured: emailConfigured(),
    smsConfigured: smsConfigured(),
    recentFailures: rows.filter((r) => r.status === "failed").length,
    recentLogged: rows.filter((r) => r.status === "logged").length,
    lastError: rows.find((r) => r.status === "failed")?.error ?? null,
  };
}
