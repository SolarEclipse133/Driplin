import type { JobHealth } from "@/lib/jobs/health";

/**
 * Says, on the dashboard, that Driplin has stopped checking.
 *
 * The loudest thing in the product, deliberately. Every other warning
 * means something needs attention; this one means the thing that finds
 * out what needs attention is not running — so everything else on the
 * page is stale and might be reassuring for no reason.
 *
 * Driplin exists to notice when something quietly stopped being true.
 * It owes its customers the same about itself.
 */
export function MonitoringWarning({ health }: { health: JobHealth }) {
  if (!health.stale) return null;

  const since =
    health.hoursSinceSuccess === null
      ? null
      : health.hoursSinceSuccess < 48
        ? `${Math.round(health.hoursSinceSuccess)} hours`
        : `${Math.round(health.hoursSinceSuccess / 24)} days`;

  return (
    <div
      role="alert"
      className="mt-3 rounded-xl border-2 border-red-300 bg-red-50 p-4"
    >
      <p className="text-sm font-semibold text-red-900">
        Driplin has stopped checking your properties
      </p>
      <p className="mt-1 text-sm text-red-800">
        {since
          ? `The nightly check last completed ${since} ago. Anything below is from that check and may no longer be true.`
          : "The nightly check has never completed successfully. Nothing below has been verified."}
      </p>
      {health.lastError && (
        <p className="mt-2 rounded-md bg-white/70 px-3 py-2 text-xs text-red-900">
          {health.lastError}
        </p>
      )}
      <p className="mt-2 text-xs text-red-800">
        Compliance is not being monitored until this is fixed. Please get in
        touch.
      </p>
    </div>
  );
}
