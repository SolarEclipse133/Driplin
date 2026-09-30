"use client";

import { useActionState, useState } from "react";
import type { BoardLinkState } from "@/app/(app)/properties/[id]/board-actions";

/**
 * A read-only link for the HOA board.
 *
 * The board is who this is all ultimately for, and until now they had
 * no way to see any of it. The raw link is shown once, at creation,
 * because Driplin stores only its hash — the same discipline as the
 * vendor work-order link.
 */
export function BoardLink({
  action,
  revokeAction,
  propertyId,
  existing,
}: {
  action: (prev: BoardLinkState, formData: FormData) => Promise<BoardLinkState>;
  revokeAction: (formData: FormData) => Promise<void>;
  propertyId: string;
  existing: {
    id: string;
    label: string | null;
    createdAt: string;
    expiresAt: string;
    lastViewedAt: string | null;
  } | null;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
    link: null,
  });
  const [copied, setCopied] = useState(false);

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      dateStyle: "medium",
    });

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Board access</h3>
      <p className="mt-1 text-sm text-slate-500">
        A read-only page showing this property&apos;s compliance status and the
        rules in force. No login, nothing to click, and nothing about any of
        your other properties.
      </p>

      {existing && !state.link && (
        <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <p className="font-medium text-slate-800">
            {existing.label || "Board link"} is live
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Created {date(existing.createdAt)} · expires {date(existing.expiresAt)} ·{" "}
            {existing.lastViewedAt
              ? `last opened ${date(existing.lastViewedAt)}`
              : "never opened"}
          </p>
          <form action={revokeAction} className="mt-2">
            <input type="hidden" name="property_id" value={propertyId} />
            <input type="hidden" name="link_id" value={existing.id} />
            <button className="text-xs font-medium text-red-700 hover:underline">
              Turn this link off
            </button>
          </form>
        </div>
      )}

      {state.link && (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2">
          <p className="text-sm text-green-900">{state.success}</p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={state.link}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.link!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
              className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="property_id" value={propertyId} />
        <label className="flex-1 text-xs text-slate-600">
          Who is it for?
          <input
            name="label"
            placeholder="Oak Ridge HOA board"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? "Creating…" : existing ? "Replace link" : "Create link"}
        </button>
      </form>

      {existing && (
        <p className="mt-2 text-xs text-slate-400">
          Creating a new link turns the old one off, so a link that has been
          passed around stops working.
        </p>
      )}

      {state.error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
