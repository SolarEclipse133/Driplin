"use client";

import { useActionState, useState } from "react";
import type { PlanChangeState } from "@/app/(app)/admin/actions";
import { PLAN_IDS, PLANS } from "@/lib/billing/plans";

const STATUSES = ["trialing", "active", "past_due", "cancelled"] as const;

export interface OrgPlanRow {
  orgId: string;
  orgName: string;
  plan: string;
  status: string;
  propertyLimit: number | null;
  propertyCount: number;
  trialEndsAt: string | null;
  notes: string | null;
}

/**
 * Change a company's plan.
 *
 * Blunt on purpose. The commercial decision happens in a conversation;
 * this only records what was agreed, which is the right amount of
 * machinery while every customer is invoiced by hand.
 */
export function AdminPlans({
  action,
  orgs,
}: {
  action: (prev: PlanChangeState, formData: FormData) => Promise<PlanChangeState>;
  orgs: OrgPlanRow[];
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
  });
  const [open, setOpen] = useState<string | null>(null);

  if (orgs.length === 0)
    return <p className="mt-2 text-sm text-slate-500">No organizations yet.</p>;

  return (
    <div className="mt-3 space-y-2">
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">
          {state.success}
        </p>
      )}

      {orgs.map((o) => (
        <div key={o.orgId} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{o.orgName}</p>
              <p className="text-xs text-slate-500">
                {PLANS[o.plan as keyof typeof PLANS]?.name ?? o.plan} · {o.status} ·{" "}
                {o.propertyCount}
                {o.propertyLimit === null ? " properties" : ` of ${o.propertyLimit}`}
                {o.trialEndsAt && o.status === "trialing"
                  ? ` · pilot ends ${new Date(o.trialEndsAt).toLocaleDateString("en-US", { timeZone: "America/Chicago", dateStyle: "medium" })}`
                  : ""}
              </p>
              {o.notes && <p className="mt-1 text-xs text-slate-400">{o.notes}</p>}
            </div>
            <button
              type="button"
              onClick={() => setOpen(open === o.orgId ? null : o.orgId)}
              className="text-xs font-medium text-sky-700 hover:underline"
            >
              {open === o.orgId ? "Cancel" : "Change plan"}
            </button>
          </div>

          {open === o.orgId && (
            <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="org_id" value={o.orgId} />
              <label className="text-xs text-slate-600">
                Plan
                <select
                  name="plan"
                  defaultValue={o.plan}
                  className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  {PLAN_IDS.map((id) => (
                    <option key={id} value={id}>
                      {PLANS[id].name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Status
                <select
                  name="status"
                  defaultValue={o.status}
                  className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Property limit
                <input
                  name="property_limit"
                  defaultValue={o.propertyLimit ?? ""}
                  placeholder="plan default"
                  className="mt-1 block w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex-1 text-xs text-slate-600">
                Note
                <input
                  name="notes"
                  defaultValue={o.notes ?? ""}
                  placeholder="e.g. comped through March"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
