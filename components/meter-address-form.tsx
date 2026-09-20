"use client";

import { useActionState, useState } from "react";
import type { MeterFormState } from "@/app/(app)/properties/[id]/controller-actions";

/**
 * Point one controller at its own irrigation meter.
 *
 * Collapsed by default. Most properties have a single meter and should
 * never need to open this — the whole design is that blank means
 * "use the property's address". It exists for the HOA with a front
 * entrance, a pool and a median, each on a different watering day.
 */
export function MeterAddressForm({
  action,
  controllerId,
  propertyId,
  currentDescription,
  inheritsFromProperty,
  initial,
}: {
  action: (prev: MeterFormState, formData: FormData) => Promise<MeterFormState>;
  controllerId: string;
  propertyId: string;
  /** What this controller is judged against right now. */
  currentDescription: string;
  inheritsFromProperty: boolean;
  initial: {
    streetNumber: string;
    noStreetAddress: boolean;
    label: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [noAddress, setNoAddress] = useState(initial.noStreetAddress);
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
  });

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Meter:{" "}
          <span className="font-medium text-slate-700">
            {currentDescription}
          </span>
          {inheritsFromProperty ? (
            <span className="ml-1.5 text-slate-400">
              (from the property address)
            </span>
          ) : (
            <span className="ml-1.5 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">
              own meter
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-sky-700 hover:underline"
        >
          {open ? "Cancel" : "Change meter address"}
        </button>
      </div>

      {open && (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="controller_id" value={controllerId} />
          <input type="hidden" name="property_id" value={propertyId} />
          <p className="text-xs text-slate-500">
            Only fill this in when this controller is on a{" "}
            <strong>different meter</strong> from the property address —
            a separate entrance, the pool, a median. Leave it blank to go
            back to using the property&apos;s address.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="meter_street_number"
              defaultValue={initial.streetNumber}
              disabled={noAddress}
              placeholder="Meter street number, e.g. 1210"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-400"
            />
            <input
              name="meter_label"
              defaultValue={initial.label}
              placeholder="Where it is, e.g. North entrance"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              name="meter_no_street_address"
              checked={noAddress}
              onChange={(e) => setNoAddress(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-sky-700 focus:ring-sky-500"
            />
            This meter has no street address of its own (median, entryway)
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save meter address"}
          </button>
          {state.error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-900">
              {state.success}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
