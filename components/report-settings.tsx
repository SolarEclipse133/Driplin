"use client";

import { useActionState } from "react";
import type { ReportSettingsState } from "@/app/(app)/settings/actions";

/**
 * How often board reports go out.
 *
 * Worth a setting rather than a fixed cadence: quarterly matches how
 * often HOA boards meet, but a manager reporting to a commercial owner
 * may want monthly, and somebody mid-pilot may want neither.
 */
export function ReportSettings({
  action,
  current,
}: {
  action: (
    prev: ReportSettingsState,
    formData: FormData
  ) => Promise<ReportSettingsState>;
  current: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
  });

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Board reports</h3>
      <p className="mt-1 text-sm text-slate-500">
        One PDF per property, emailed to everyone on this account, ready to
        hand to a board as it is.
      </p>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-600">
          How often
          <select
            name="report_frequency"
            defaultValue={current}
            className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="quarterly">Quarterly</option>
            <option value="monthly">Monthly</option>
            <option value="off">Don&apos;t send them</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">
          {state.success}
        </p>
      )}
    </div>
  );
}
