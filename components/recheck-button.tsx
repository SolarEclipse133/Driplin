"use client";

import { useActionState } from "react";
import type { CheckState } from "@/app/(app)/dashboard/actions";

export function RecheckButton({
  action,
}: {
  action: (prev: CheckState, formData: FormData) => Promise<CheckState>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
  });
  return (
    <form action={formAction} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Checking…" : "Re-check compliance now"}
      </button>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {state.success}
        </p>
      )}
    </form>
  );
}
