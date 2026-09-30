import type { Entitlements } from "@/lib/billing/plans";

/**
 * What this company is on, and what that allows.
 *
 * States the limit plainly and, when the pilot has run out, says
 * explicitly that monitoring continues. Someone reading a billing
 * notice should not have to wonder whether their sprinklers are still
 * being watched.
 */
export function PlanPanel({
  entitlements,
  contactNote,
}: {
  entitlements: Entitlements;
  contactNote: string;
}) {
  const {
    plan,
    status,
    propertyCount,
    propertyLimit,
    trialDaysLeft,
    trialExpired,
    atLimit,
    blockedReason,
  } = entitlements;

  const used = propertyLimit
    ? Math.min(100, Math.round((propertyCount / propertyLimit) * 100))
    : 0;

  const STATUS: Record<string, { label: string; className: string }> = {
    trialing: { label: "Pilot", className: "bg-sky-50 text-sky-800" },
    active: { label: "Active", className: "bg-green-50 text-green-800" },
    past_due: { label: "Payment due", className: "bg-amber-50 text-amber-900" },
    cancelled: { label: "Ended", className: "bg-slate-100 text-slate-600" },
  };
  const badge = STATUS[status] ?? STATUS.trialing;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">{plan.name} plan</h3>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <p className="text-sm tabular-nums text-slate-600">
          <span className="font-semibold text-slate-900">{propertyCount}</span>
          {propertyLimit === null
            ? " properties"
            : ` of ${propertyLimit} properties`}
        </p>
      </div>

      <p className="mt-1 text-sm text-slate-500">{plan.blurb}</p>

      {propertyLimit !== null && (
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
          role="presentation"
        >
          <div
            className={`h-full rounded-full ${atLimit ? "bg-amber-500" : "bg-sky-600"}`}
            style={{ width: `${Math.max(4, used)}%` }}
          />
        </div>
      )}

      {trialDaysLeft !== null && !trialExpired && (
        <p className="mt-3 text-sm text-slate-600">
          {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left in your
          pilot.
        </p>
      )}

      {blockedReason && (
        <div className="mt-3 rounded-md bg-amber-50 px-3 py-2">
          <p className="text-sm font-medium text-amber-900">{blockedReason}</p>
          <p className="mt-1 text-xs text-amber-800">
            Compliance checks, corrections and alerts carry on as normal for
            everything already set up. Only adding new properties is paused.
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">{contactNote}</p>
    </div>
  );
}
