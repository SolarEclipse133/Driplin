"use client";

import { useActionState } from "react";
import type { ConnectFormState } from "@/app/(app)/properties/[id]/controller-actions";

/** Shared API-key form for connecting a vendor account (Rachio, Hydrawise). */
export function VendorConnectForm({
  action,
  vendorLabel,
  keyHint,
}: {
  action: (
    prev: ConnectFormState,
    formData: FormData
  ) => Promise<ConnectFormState>;
  vendorLabel: string;
  keyHint: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
  });

  return (
    <form action={formAction} className="mt-3 space-y-3" noValidate>
      <div>
        <label
          htmlFor={`api_key_${vendorLabel}`}
          className="block text-sm font-medium"
        >
          {vendorLabel} API key
        </label>
        <input
          id={`api_key_${vendorLabel}`}
          name="api_key"
          type="password"
          autoComplete="off"
          placeholder={keyHint}
          className="mt-1 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <p className="mt-1 text-xs text-slate-500">
          {keyHint}. Stored once for your whole company.
        </p>
      </div>

      {state.error && (
        <p
          role="alert"
          className="max-w-md rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="max-w-md rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {pending ? "Checking key…" : "Save & connect"}
      </button>
    </form>
  );
}
