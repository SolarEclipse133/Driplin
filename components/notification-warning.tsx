import Link from "next/link";
import type { NotificationHealth } from "@/lib/notifications/health";

/**
 * Says, on the page managers actually look at, that alerts are not
 * reaching anybody.
 *
 * Deliberately loud. Every other banner in Driplin is informational;
 * this one means the safety net is not attached, and the failure it
 * describes is invisible by design — nothing arrives, so nothing
 * prompts anyone to check.
 */
export function NotificationWarning({
  health,
}: {
  health: NotificationHealth;
}) {
  const nothingConfigured = !health.emailConfigured && !health.smsConfigured;
  const partlyConfigured =
    !nothingConfigured && (!health.emailConfigured || !health.smsConfigured);
  const failing = health.recentFailures > 0;

  if (!nothingConfigured && !partlyConfigured && !failing) return null;

  // A provider actively rejecting messages is more urgent than one that
  // was never set up: someone believes delivery is working.
  const severe = failing || nothingConfigured;

  return (
    <div
      role="alert"
      className={`mt-3 rounded-xl border p-4 ${
        severe
          ? "border-red-200 bg-red-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <p
        className={`text-sm font-semibold ${
          severe ? "text-red-900" : "text-amber-900"
        }`}
      >
        {failing
          ? `${health.recentFailures} alert${health.recentFailures === 1 ? "" : "s"} could not be delivered in the last 7 days`
          : nothingConfigured
            ? "Alerts are not being delivered to anyone"
            : `Alerts are only going out by ${health.emailConfigured ? "email" : "SMS"}`}
      </p>

      <p
        className={`mt-1 text-sm ${severe ? "text-red-800" : "text-amber-800"}`}
      >
        {failing
          ? "Driplin composed the message and the provider rejected it. Nobody received it."
          : nothingConfigured
            ? "Driplin is still detecting problems and recording them, but the messages are only being written to the log. If a property goes out of compliance, nobody will be told."
            : `${health.emailConfigured ? "SMS" : "Email"} sending is not configured, so urgent alerts reach fewer people than they should.`}
      </p>

      {health.lastError && (
        <p className="mt-2 rounded-md bg-white/70 px-3 py-2 text-xs text-red-900">
          {health.lastError}
        </p>
      )}

      <Link
        href="/settings"
        className={`mt-2 inline-block text-sm font-medium underline ${
          severe ? "text-red-900" : "text-amber-900"
        }`}
      >
        Check notification settings
      </Link>
    </div>
  );
}
