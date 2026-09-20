"use client";

import { useActionState } from "react";
import type { ConfirmFixState } from "@/app/(app)/properties/[id]/confirm-actions";

/**
 * "I changed it by hand" button. Deliberately low friction: the note is
 * optional, because anything that slows down confirming makes the log
 * less complete, not more.
 */
export function ConfirmFixForm({
  action,
  controllerId,
  propertyId,
}: {
  action: (
    prev: ConfirmFixState,
    formData: FormData
  ) => Promise<ConfirmFixState>;
  controllerId: string;
  propertyId: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
    remainingProblems: [],
  });

  return (
    <form action={formAction} className="mt-3 space-y-2">
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

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            state.remainingProblems.length > 0
              ? "bg-red-50 text-red-800"
              : "bg-green-50 text-green-800"
          }`}
        >
          <p>{state.success}</p>
          {state.remainingProblems.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {state.remainingProblems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
