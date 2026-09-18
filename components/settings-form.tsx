"use client";

import { useActionState } from "react";
import type { SettingsState } from "@/app/(app)/settings/actions";

export function SettingsForm({
  action,
  initial,
}: {
  action: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
  initial: { full_name: string; phone: string; email: string };
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
  });

  return (
    <form action={formAction} className="max-w-md space-y-4" noValidate>
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium">
          Your name
        </label>
        <input
          id="full_name"
          name="full_name"
          defaultValue={initial.full_name}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Email (for alerts)</label>
        <p className="mt-1 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {initial.email}
        </p>
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium">
          Mobile number for SMS alerts (optional)
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={initial.phone}
          placeholder="(512) 555-1234"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>

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

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
