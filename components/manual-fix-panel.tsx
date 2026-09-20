"use client";

import { useActionState } from "react";
import type { ConfirmFixState } from "@/app/(app)/properties/[id]/confirm-actions";
import type { WorkOrderState } from "@/app/(app)/properties/[id]/work-order-actions";
import { SendToVendor } from "./send-to-vendor";

/**
 * The manual-fix instructions plus the "I've updated it" confirmation.
 *
 * This is always mounted, even for a controller that needs nothing, and
 * returns null when there is nothing to show. That matters: a
 * successful confirmation flips the controller to compliant, and if the
 * server simply stopped rendering this block the success message would
 * disappear at the exact moment the person needed to see it.
 */
export function ManualFixPanel({
  action,
  controllerId,
  propertyId,
  vendorLabel,
  needsManualFix,
  instructions,
  sendToVendorAction,
  vendors,
  openOrderCount,
}: {
  action: (
    prev: ConfirmFixState,
    formData: FormData
  ) => Promise<ConfirmFixState>;
  controllerId: string;
  propertyId: string;
  vendorLabel: string;
  needsManualFix: boolean;
  instructions: string[];
  sendToVendorAction: (
    prev: WorkOrderState,
    formData: FormData
  ) => Promise<WorkOrderState>;
  vendors: { id: string; name: string; email: string | null }[];
  openOrderCount: number;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
    remainingProblems: [],
  });

  const result = state.error ? null : state.success;
  const stillFailing = state.remainingProblems.length > 0;

  // Nothing to say: no outstanding fix and nothing just happened.
  if (!needsManualFix && !result && !state.error) return null;

  return (
    <div
      className={`mt-3 rounded-md border p-3 ${
        needsManualFix
          ? "border-amber-200 bg-amber-50"
          : "border-green-200 bg-green-50"
      }`}
    >
      {needsManualFix && (
        <>
          <p className="text-sm font-semibold text-amber-900">
            This controller can&apos;t be updated remotely — please make
            these changes in the {vendorLabel} app:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-amber-900">
            {instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-amber-700">
            When it&apos;s done, confirm below — Driplin will re-read the
            controller and tell you whether it now matches.
          </p>
        </>
      )}

      {needsManualFix && (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="controller_id" value={controllerId} />
          <input type="hidden" name="property_id" value={propertyId} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="note"
              placeholder="Optional note (e.g. changed on site, 9:15am)"
              className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <button
              type="submit"
              disabled={pending}
              className="shrink-0 rounded-md bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {pending ? "Checking the controller…" : "I've updated it"}
            </button>
          </div>
        </form>
      )}

      {needsManualFix && (
        <SendToVendor
          action={sendToVendorAction}
          controllerId={controllerId}
          propertyId={propertyId}
          vendors={vendors}
          openOrderCount={openOrderCount}
        />
      )}

      {state.error && (
        <p
          role="alert"
          className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      {result && (
        <div
          className={`mt-2 rounded-md px-3 py-2 text-sm ${
            stillFailing ? "bg-red-50 text-red-800" : "bg-white text-green-900"
          }`}
        >
          <p className="font-medium">{result}</p>
          {stillFailing && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {state.remainingProblems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
