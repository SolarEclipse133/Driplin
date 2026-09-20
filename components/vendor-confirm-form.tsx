"use client";

import { useActionState } from "react";
import type { VendorConfirmState } from "@/app/fix/[token]/actions";

/**
 * What the landscaper sees on their phone. Big tap target, nothing to
 * read, no account to make. The name field is prefilled with the
 * company so the log is never anonymous, but stays editable so the
 * individual who did the work can put their own name to it.
 */
export function VendorConfirmForm({
  action,
  token,
  vendorName,
}: {
  action: (
    prev: VendorConfirmState,
    formData: FormData
  ) => Promise<VendorConfirmState>;
  token: string;
  vendorName: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
    stillWrong: [],
  });

  if (state.success) {
    return (
      <div
        className={`rounded-xl p-4 ${
          state.stillWrong.length > 0 ? "bg-red-50" : "bg-green-50"
        }`}
      >
        <p
          className={`text-sm font-medium ${
            state.stillWrong.length > 0 ? "text-red-800" : "text-green-900"
          }`}
        >
          {state.success}
        </p>
        {state.stillWrong.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
            {state.stillWrong.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Your name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={vendorName}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      <div>
        <label htmlFor="note" className="block text-sm font-medium">
          Note (optional)
        </label>
        <input
          id="note"
          name="note"
          placeholder="Anything worth flagging?"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-sky-700 px-4 py-4 text-base font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {pending ? "Checking the controller…" : "I've made these changes"}
      </button>
    </form>
  );
}
