"use client";

import { useActionState, useState } from "react";
import type { InviteState } from "@/app/(app)/settings/team-actions";

export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  isYou: boolean;
}

export interface PendingInvite {
  id: string;
  email: string;
  expiresAt: string;
}

/**
 * Who is on this account.
 *
 * Until this existed every signup created its own company, so a
 * management firm could not put its staff on Driplin at all — and
 * assigning a property to a colleague had nobody to assign it to.
 */
export function TeamPanel({
  action,
  revokeAction,
  members,
  pending,
}: {
  action: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  revokeAction: (formData: FormData) => Promise<void>;
  members: TeamMember[];
  pending: PendingInvite[];
}) {
  const [state, formAction, submitting] = useActionState(action, {
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
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">People on this account</h3>
      <p className="mt-1 text-sm text-slate-500">
        Everyone here can see your properties. Alerts for a property go to
        whoever it&apos;s assigned to, or to everyone if it isn&apos;t assigned.
      </p>

      <ul className="mt-3 divide-y divide-slate-100">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {m.name}
              {m.isYou && <span className="ml-2 text-xs text-slate-400">you</span>}
            </span>
            <span className="text-slate-500">{m.email}</span>
          </li>
        ))}
      </ul>

      {pending.length > 0 && (
        <div className="mt-3 rounded-md bg-slate-50 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Invited, not joined yet
          </p>
          <ul className="mt-1 space-y-1">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between text-sm">
                <span>{i.email}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">
                    expires {date(i.expiresAt)}
                  </span>
                  <form action={revokeAction}>
                    <input type="hidden" name="invitation_id" value={i.id} />
                    <button className="text-xs font-medium text-red-700 hover:underline">
                      Withdraw
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex-1 text-xs text-slate-600">
          Invite a colleague
          <input
            name="email"
            type="email"
            placeholder="colleague@company.com"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send invitation"}
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
      {state.link && (
        <div className="mt-2 flex gap-2">
          <input
            readOnly
            value={state.link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-xs"
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
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
