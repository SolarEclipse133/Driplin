"use client";

import { useActionState, useState } from "react";
import type { ManualControllerState } from "@/app/(app)/properties/[id]/controller-actions";
import type { ScheduleProgram } from "@/lib/controllers/types";

const DAYS = [
  ["MON", "Mon"], ["TUE", "Tue"], ["WED", "Wed"], ["THU", "Thu"],
  ["FRI", "Fri"], ["SAT", "Sat"], ["SUN", "Sun"],
] as const;

/**
 * Correct what an unconnected controller is recorded as being set to.
 *
 * Driplin cannot read this hardware, so the stored schedule is whatever
 * somebody last told it. Until now that could only be said once, when
 * the controller was added, which made a typo permanent -- Driplin would
 * judge the wrong schedule indefinitely and send a landscaper after a
 * problem that did not exist.
 */
export function EditEnteredSchedule({
  action,
  controllerId,
  propertyId,
  program,
  enteredAt,
}: {
  action: (
    prev: ManualControllerState,
    formData: FormData
  ) => Promise<ManualControllerState>;
  controllerId: string;
  propertyId: string;
  program: ScheduleProgram | null;
  enteredAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
  } as ManualControllerState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-600">
          Driplin can&apos;t read this controller, so the schedule above is
          what your team told it
          {enteredAt
            ? `, last updated ${new Date(enteredAt).toLocaleDateString("en-US", {
                timeZone: "America/Chicago",
              })}`
            : ""}
          .
        </p>
        {state.success && (
          <p className="mt-2 text-xs font-medium text-emerald-800">
            {state.success}
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-xs font-medium text-sky-700 underline"
        >
          Correct what it&apos;s set to
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 rounded-md border border-slate-200 bg-white p-3"
    >
      <input type="hidden" name="controller_id" value={controllerId} />
      <input type="hidden" name="property_id" value={propertyId} />

      <p className="text-xs text-slate-600">
        Enter what the timer on the wall is actually set to — not what it
        should be. Driplin works out the difference and tells you what to
        change.
      </p>

      <label className="mt-3 block text-sm">
        <span className="font-medium">Program name</span>
        <input
          name="program_name"
          defaultValue={program?.name ?? "Irrigation"}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <fieldset className="mt-3">
        <legend className="text-sm font-medium">Days it runs</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {DAYS.map(([value, label]) => (
            <label key={value} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                name={`day_${value}`}
                defaultChecked={program?.days.includes(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 flex flex-wrap gap-3">
        <label className="block text-sm">
          <span className="font-medium">Start time</span>
          <input
            type="time"
            name="start_time"
            defaultValue={program?.startTime ?? "05:00"}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Minutes</span>
          <input
            type="number"
            name="duration_minutes"
            min={1}
            max={720}
            defaultValue={program?.durationMinutes ?? 20}
            className="mt-1 w-24 rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      {state.error && (
        <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
