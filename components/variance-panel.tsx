"use client";

import { useActionState, useState } from "react";
import { WEEKDAYS } from "@/lib/controllers/types";
import type { VarianceState } from "@/app/(app)/properties/[id]/variance-actions";
import type { Variance, VarianceStatus } from "@/lib/rules/variance";

/**
 * Approved variances on a property.
 *
 * Collapsed unless something needs attention. Most properties have no
 * variance and should never think about this; it exists for the HOA
 * common area that genuinely cannot be watered inside one city window
 * and holds a Large Property approval to prove it.
 *
 * The copy works hard to stay honest: a variance is the UTILITY's
 * decision, reported by the customer. Driplin judges against it and
 * says so, but never claims to have verified it, and never widens a
 * controller's schedule on its strength.
 */
export function VariancePanel({
  action,
  removeAction,
  propertyId,
  status,
  utility,
  stageName,
  describe,
}: {
  action: (prev: VarianceState, formData: FormData) => Promise<VarianceState>;
  removeAction: (formData: FormData) => Promise<void>;
  propertyId: string;
  status: VarianceStatus;
  utility: string;
  stageName: string;
  /** Pre-rendered one-liners, so the server owns the wording. */
  describe: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
  } as VarianceState);
  const [open, setOpen] = useState(false);
  const [anyDay, setAnyDay] = useState(false);

  const active = status.active;

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold">Approved variances</h2>

      {active ? (
        <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm font-semibold text-sky-900">
            This property waters under an approved variance
          </p>
          <p className="mt-1 text-sm text-sky-900">{describe[active.id]}</p>
          <p className="mt-2 text-xs text-sky-800">
            Driplin judges this property against the variance instead of{" "}
            {utility}&apos;s standard {stageName} schedule. {utility} approved
            it and your team recorded it — Driplin has not verified it with{" "}
            {utility}, so it will not change the controller automatically while
            it applies.
          </p>

          {status.expiringSoon && (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {status.daysUntilExpiry === 0
                ? "This variance expires today."
                : `This variance expires in ${status.daysUntilExpiry} day${status.daysUntilExpiry === 1 ? "" : "s"}.`}{" "}
              The day after it lapses this property is back on {utility}&apos;s
              standard schedule, so renew it or plan to change the controller.
            </p>
          )}

          {status.stageAdvanced && (
            <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              The drought stage has tightened since this variance was
              approved. {utility} restricts which variances stay valid at
              stricter stages, so this one may no longer apply. Confirm with{" "}
              {utility} before relying on it.
            </p>
          )}

          <form action={removeAction} className="mt-3">
            <input type="hidden" name="variance_id" value={active.id} />
            <input type="hidden" name="property_id" value={propertyId} />
            <button
              type="submit"
              className="text-xs font-medium text-sky-900 underline"
            >
              Remove this variance
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          None. This property is judged against {utility}&apos;s standard{" "}
          {stageName} schedule. If {utility} has granted it a variance — for a
          new landscape, or a large property that cannot be watered inside one
          window — record it here so Driplin stops flagging legal watering.
        </p>
      )}

      {status.expired.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-slate-500">
            {status.expired.length} expired variance
            {status.expired.length === 1 ? "" : "s"} (kept for the record)
          </summary>
          <ul className="mt-2 space-y-1">
            {status.expired.map((v: Variance) => (
              <li key={v.id} className="text-xs text-slate-500">
                {describe[v.id]}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Record a variance
        </button>
      ) : (
        <form
          action={formAction}
          className="mt-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <input type="hidden" name="property_id" value={propertyId} />

          <p className="text-sm text-slate-600">
            Copy these from {utility}&apos;s approval letter. Enter what it
            actually says — Driplin will judge this property against it, so a
            guess here becomes a violation later.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Approval / reference number</span>
              <input
                name="reference"
                required
                placeholder="e.g. AW-2026-4417"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Type</span>
              <select
                name="kind"
                defaultValue="large_property"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="large_property">
                  Large property (cannot be fully watered on schedule)
                </option>
                <option value="new_landscape">New / xeriscape landscape</option>
                <option value="environmental">Environmental</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Approved on</span>
              <input
                type="date"
                name="approved_on"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Expires on</span>
              <input
                type="date"
                name="expires_on"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Days it permits</legend>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="any_day"
                checked={anyDay}
                onChange={(e) => setAnyDay(e.target.checked)}
              />
              The approval sets no day limit (any day)
            </label>
            {!anyDay && (
              <div className="mt-2 flex flex-wrap gap-3">
                {WEEKDAYS.map((d) => (
                  <label key={d} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name={`day_${d}`} />
                    {d[0] + d.slice(1).toLowerCase()}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium">
              Hours it permits{" "}
              <span className="font-normal text-slate-500">
                (leave blank if the letter sets no time limit)
              </span>
            </legend>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="time"
                name="window_start"
                className="rounded-md border border-slate-300 px-3 py-2"
              />
              <span className="text-slate-500">to</span>
              <input
                type="time"
                name="window_end"
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
          </fieldset>

          <label className="mt-4 block text-sm">
            <span className="font-medium">Notes</span>
            <textarea
              name="notes"
              rows={2}
              placeholder="Anything else the letter says — conditions, the contact who approved it."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          {state.error && (
            <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {state.success}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save variance"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
