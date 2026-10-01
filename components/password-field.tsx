"use client";

import { useId, useState, type ComponentPropsWithoutRef } from "react";

/**
 * A password box you can choose to see.
 *
 * Typing a password you cannot read is a small, constant tax, and it is
 * worst exactly where it matters most: confirming a new one, or pasting a
 * long generated one on a phone. The usual result is people picking
 * something short enough to type blind.
 *
 * Hidden by default, revealed only by a deliberate click, and the state is
 * never remembered between page loads — so nothing is uncovered on a
 * screen the person is not currently looking at.
 */
type Props = ComponentPropsWithoutRef<"input"> & {
  label: string;
  /** Optional note under the field. */
  hint?: string;
};

export function PasswordField({ label, hint, className = "", ...input }: Props) {
  const [visible, setVisible] = useState(false);
  const hintId = useId();

  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <span className="relative mt-1 block">
        <input
          {...input}
          type={visible ? "text" : "password"}
          aria-describedby={hint ? hintId : undefined}
          // Room for the button, so a long value never runs under it.
          className={`w-full rounded-md border border-slate-300 px-3 py-2 pr-11 ${className}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // Named for what it does next, and marked with what it is now,
          // so a screen reader announces the state rather than just "eye".
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </span>
      {hint && (
        <span id={hintId} className="mt-1 block text-xs text-slate-500">
          {hint}
        </span>
      )}
    </label>
  );
}

function Eye() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
      <path d="M6.2 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 3.6-.7" />
    </svg>
  );
}
