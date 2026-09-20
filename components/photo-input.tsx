"use client";

import { useRef, useState } from "react";
import { downscaleImage } from "@/lib/photos/downscale";
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  PHOTO_ACCEPT_ATTR,
  megabytes,
} from "@/lib/photos/limits";

/**
 * The photo field on both confirmation forms.
 *
 * Everything here exists to keep an oversized phone photo from ever
 * being submitted: the file is shrunk as soon as it is chosen, and the
 * parent's submit button is held until that finishes. A file that is
 * still too big afterwards is refused right here, with a sentence the
 * person can act on — the alternative is the framework rejecting the
 * request and showing a blank error page.
 */
export function PhotoInput({
  id,
  label,
  hint,
  capture,
  tone = "slate",
  onBusyChange,
}: {
  id: string;
  label: string;
  hint?: string;
  /** Opens the camera directly on a phone. */
  capture?: boolean;
  tone?: "slate" | "amber";
  onBusyChange?: (busy: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  function clear(message: string) {
    if (ref.current) ref.current.value = "";
    setRejected(true);
    setStatus(message);
  }

  async function handleChange() {
    const file = ref.current?.files?.[0];
    setRejected(false);
    if (!file) {
      setStatus(null);
      return;
    }

    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      clear("That needs to be a JPEG, PNG or WebP photo.");
      return;
    }

    onBusyChange?.(true);
    setStatus("Preparing photo…");
    try {
      const smaller = await downscaleImage(file);

      if (smaller !== file && ref.current) {
        // Swapping the input's file list keeps the form a plain form:
        // it still submits normally, just with the smaller image.
        try {
          const transfer = new DataTransfer();
          transfer.items.add(smaller);
          ref.current.files = transfer.files;
        } catch {
          // Very old browser without DataTransfer — fall through and
          // let the size check below decide.
        }
      }

      const final = ref.current?.files?.[0] ?? file;
      if (final.size > MAX_PHOTO_BYTES) {
        clear(
          `That photo is ${megabytes(final.size)} and we can't shrink it enough — the limit is ${megabytes(MAX_PHOTO_BYTES)}.`
        );
        return;
      }
      setStatus(`Photo ready (${megabytes(final.size)}).`);
    } finally {
      onBusyChange?.(false);
    }
  }

  const labelClass =
    tone === "amber" ? "text-xs text-amber-800" : "text-sm font-medium";
  const fileClass =
    tone === "amber"
      ? "mt-1 block w-full text-xs file:mr-3 file:rounded-md file:border file:border-amber-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-amber-900"
      : "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium";

  return (
    <div>
      <label htmlFor={id} className={`block ${labelClass}`}>
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        name="photo"
        type="file"
        accept={PHOTO_ACCEPT_ATTR}
        {...(capture ? { capture: "environment" as const } : {})}
        onChange={handleChange}
        className={fileClass}
      />
      {hint && !status && (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
      {status && (
        <p
          className={`mt-1 text-xs ${rejected ? "text-red-700" : "text-slate-500"}`}
          role={rejected ? "alert" : undefined}
        >
          {status}
        </p>
      )}
    </div>
  );
}
