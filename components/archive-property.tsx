"use client";

import { useState } from "react";

/**
 * Take a property out of the portfolio.
 *
 * Reads as reversible, because now it is. The old copy said "this
 * cannot be undone", which was true and was the problem: the only way
 * to remove a property destroyed the compliance record with it.
 */
export function ArchiveProperty({
  propertyName,
  propertyId,
}: {
  propertyName: string;
  propertyId: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
      >
        Archive property
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <label className="block text-sm">
        <span className="font-medium">
          Why is {propertyName} leaving the portfolio?
        </span>
        <input
          name="archive_reason"
          placeholder="Contract ended / sold / entered by mistake"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Archive
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
      <input type="hidden" name="property_id" value={propertyId} />
    </div>
  );
}

/**
 * Destroy the record for good.
 *
 * Shown only on an already-archived property, and made to feel like
 * what it is. Requires typing the property's name, because the one
 * thing worse than losing a property is losing the proof you managed it
 * legally.
 */
export function PurgeProperty({ propertyName }: { propertyName: string }) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === propertyName.trim();

  return (
    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-semibold text-red-900">
        Delete this record permanently
      </p>
      <p className="mt-1 text-xs text-red-800">
        This destroys every compliance check, every photo of a hands-on fix,
        and every work order for {propertyName}. If a city or a board asks you
        to show that this property watered legally, you will have nothing.
        There is no undo and no backup to restore from.
      </p>
      <label className="mt-3 block text-xs text-red-900">
        Type <span className="font-mono font-semibold">{propertyName}</span> to
        confirm
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mt-1 w-full rounded-md border border-red-300 px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={!matches}
        className="mt-3 rounded-md border border-red-400 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
      >
        Delete permanently
      </button>
    </div>
  );
}
