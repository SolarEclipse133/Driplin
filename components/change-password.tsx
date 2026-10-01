"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "./password-field";

/**
 * Change your password while signed in.
 *
 * There was no way to do this at all: the only path to a new password was
 * the forgotten-password email, which is a slow and fragile way to do
 * something a signed-in person should be able to do directly — and which
 * depends on mail delivery working, where this does not.
 */
export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (next.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    if (next === current) {
      setError("That is the password you already have.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        setError("You are no longer signed in.");
        return;
      }

      // Re-check the current password before changing it. Supabase does
      // not require this, which means an unattended logged-in laptop is
      // enough to lock the real owner out of their own account.
      const { error: wrongPassword } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (wrongPassword) {
        setError("That current password is not right.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: next,
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      // Anyone else signed in as this account is signed out. Changing a
      // password is often done because someone else may have it.
      await supabase.auth.signOut({ scope: "others" });

      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 max-w-md space-y-3">
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
      />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        required
      />
      <PasswordField
        label="Confirm new password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      {done && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Password changed. Anywhere else this account was signed in has been
          signed out.
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
