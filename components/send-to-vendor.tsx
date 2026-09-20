"use client";

import { useActionState, useState } from "react";
import type { WorkOrderState } from "@/app/(app)/properties/[id]/work-order-actions";

/**
 * Hand this fix to a vendor. The raw link is shown once, here, because
 * it only exists at creation time — Driplin stores a hash of it and
 * genuinely cannot show it again later.
 */
export function SendToVendor({
  action,
  controllerId,
  propertyId,
  vendors,
  openOrderCount,
}: {
  action: (prev: WorkOrderState, formData: FormData) => Promise<WorkOrderState>;
  controllerId: string;
  propertyId: string;
  vendors: { id: string; name: string; email: string | null }[];
  openOrderCount: number;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
    link: null,
    emailed: false,
  });
  const [copied, setCopied] = useState(false);

  if (vendors.length === 0) {
    return (
      <p className="mt-3 text-xs text-amber-700">
        Tip: add a vendor under <strong>Vendors</strong> and assign them to
        this property, and you&apos;ll be able to send this job straight to
        them.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-amber-200 pt-3">
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="controller_id" value={controllerId} />
        <input type="hidden" name="property_id" value={propertyId} />
        <select
          name="vendor_id"
          defaultValue={vendors[0]?.id}
          className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.email ? ` (${v.email})` : " (no email)"}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send to vendor"}
        </button>
      </form>

      {openOrderCount > 0 && !state.success && (
        <p className="mt-2 text-xs text-amber-700">
          {openOrderCount} job{openOrderCount === 1 ? "" : "s"} already sent
          and still open for this controller.
        </p>
      )}

      {state.error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      {state.success && (
        <div className="mt-2 rounded-md bg-white px-3 py-2 text-sm">
          <p className="text-slate-800">{state.success}</p>
          {state.link && (
            <div className="mt-2">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={state.link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(state.link!);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      setCopied(false);
                    }
                  }}
                  className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Treat this like a password — it lets the holder close out
                this one job. It expires in 14 days, and Driplin can&apos;t
                show it again.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
