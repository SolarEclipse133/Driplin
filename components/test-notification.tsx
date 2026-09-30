"use client";

import { useActionState } from "react";
import type { TestNotificationState } from "@/app/(app)/settings/actions";

const OUTCOME = {
  sent: {
    label: "Delivered",
    className: "bg-green-50 text-green-900",
    note: "The provider accepted it. Check your inbox or phone.",
  },
  logged: {
    label: "Not delivered",
    className: "bg-amber-50 text-amber-900",
    note: "Recorded in the log only — this channel has no provider configured yet.",
  },
  failed: {
    label: "Rejected",
    className: "bg-red-50 text-red-900",
    note: "The provider refused it. Nothing arrived.",
  },
} as const;

/**
 * Prove delivery works before you need it to.
 *
 * "Delivered" here means the provider accepted the message, which is
 * as far as any sender can honestly report. The wording says exactly
 * that rather than claiming it landed in an inbox.
 */
export function TestNotification({
  action,
}: {
  action: (
    prev: TestNotificationState,
    formData: FormData
  ) => Promise<TestNotificationState>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    results: [],
  });

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Send yourself a test alert</h3>
          <p className="mt-1 text-sm text-slate-500">
            Goes out through exactly the same path a real compliance alert
            uses. If it arrives, real alerts will too.
          </p>
        </div>
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send test"}
          </button>
        </form>
      </div>

      {state.error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      {state.results.length > 0 && (
        <ul className="mt-3 space-y-2">
          {state.results.map((r, i) => {
            const o = OUTCOME[r.outcome as keyof typeof OUTCOME] ?? OUTCOME.logged;
            return (
              <li key={i} className={`rounded-md px-3 py-2 text-sm ${o.className}`}>
                <span className="font-medium uppercase">{r.channel}</span>
                <span className="mx-2">→</span>
                <span>{r.recipient}</span>
                <span className="ml-2 font-semibold">{o.label}</span>
                <p className="mt-0.5 text-xs opacity-90">{o.note}</p>
                {r.detail && (
                  <p className="mt-1 rounded bg-white/70 px-2 py-1 text-xs">
                    {r.detail}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
