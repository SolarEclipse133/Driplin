"use client";

import { useActionState, useState } from "react";
import type { ManualControllerState } from "@/app/(app)/properties/[id]/controller-actions";

const DAYS = [
  ["MON", "Mon"], ["TUE", "Tue"], ["WED", "Wed"], ["THU", "Thu"],
  ["FRI", "Fri"], ["SAT", "Sat"], ["SUN", "Sun"],
] as const;

/**
 * For the timer on the wall that isn't connected to anything.
 *
 * Most HOA common-area irrigation runs on hardware with no network at
 * all. Driplin can still do the part that matters — know the rules,
 * say what to change, route it to a landscaper, keep the record — as
 * long as somebody tells it what the controller is currently set to.
 */
export function AddManualController({
  action,
  propertyId,
}: {
  action: (
    prev: ManualControllerState,
    formData: FormData
  ) => Promise<ManualControllerState>;
  propertyId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
  });

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            Controller that isn&apos;t connected to the internet
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            An older timer on the wall — Rain Bird, Hunter, Toro. Tell
            Driplin what it&apos;s set to and it will work out whether that
            breaks the rules, what to change, and keep the record for your
            board.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          {open ? "Cancel" : "Add one"}
        </button>
      </div>

      {state.success && (
        <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">
          {state.success}
        </p>
      )}

      {open && (
        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="property_id" value={propertyId} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              What is it?
              <input
                name="name"
                placeholder="Front entrance timer"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
            <label className="block text-sm">
              What does it water?
              <input
                name="program_name"
                placeholder="Front lawn"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
          </div>

          <fieldset>
            <legend className="text-sm">Which days is it set to run?</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {DAYS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name={`day_${value}`}
                    className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Start time
              <input
                name="start_time"
                type="time"
                defaultValue="05:00"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
            <label className="block text-sm">
              Minutes it runs
              <input
                name="duration_minutes"
                type="number"
                min={1}
                defaultValue={30}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
          </div>

          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Driplin can&apos;t read this controller, so it will never claim to
            have checked it. When you confirm a change, that&apos;s recorded as
            your word — which is exactly what a board report should say.
          </p>

          {state.error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add controller"}
          </button>
        </form>
      )}
    </div>
  );
}
