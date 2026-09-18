"use client";

import { useActionState } from "react";
import type { AdminActionState } from "@/app/(app)/admin/actions";
import { STAGE_NAMES } from "@/lib/rules/watering-config";

type AdminAction = (
  prev: AdminActionState,
  formData: FormData
) => Promise<AdminActionState>;

function Feedback({ state }: { state: AdminActionState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  if (state.success)
    return (
      <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
        {state.success}
      </p>
    );
  return null;
}

export function PullLcraForm({ action }: { action: AdminAction }) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
  });
  return (
    <form action={formAction} className="mt-3 space-y-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Contacting LCRA…" : "Pull LCRA reading now"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ConfirmStageForm({
  action,
  currentStage,
}: {
  action: AdminAction;
  currentStage: number;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
  });
  return (
    <form action={formAction} className="mt-3 max-w-xl space-y-4" noValidate>
      <div>
        <label htmlFor="stage" className="block text-sm font-medium">
          Confirmed stage
        </label>
        <select
          id="stage"
          name="stage"
          defaultValue={currentStage}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          {([0, 1, 2, 3, 4] as const).map((s) => (
            <option key={s} value={s}>
              {STAGE_NAMES[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="source_link" className="block text-sm font-medium">
          Official source URL (required)
        </label>
        <input
          id="source_link"
          name="source_link"
          type="url"
          placeholder="https://www.austintexas.gov/… (Austin Water announcement)"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <p className="mt-1 text-xs text-slate-500">
          Link the official Austin Water notice or “Your Watering Schedule”
          page you verified against. Shown to customers as the audit trail.
        </p>
      </div>
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {pending ? "Confirming & re-running compliance…" : "Confirm stage"}
      </button>
      <p className="text-xs text-slate-500">
        Confirming updates every dashboard, re-evaluates schedules against
        the new stage, and pushes corrections to controllers that allow it.
      </p>
    </form>
  );
}
