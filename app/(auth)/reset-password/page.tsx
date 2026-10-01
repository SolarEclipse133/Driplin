"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/password-field";

/**
 * Set a new password, having arrived from the emailed link.
 *
 * /auth/callback has already turned the one-time code into a session by
 * the time this renders, so the check below is simply "is there one" --
 * reached directly, with no link, there is nothing to authorise the change
 * and it says so rather than presenting a form that cannot work.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setReady(data.user !== null));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Matches the rule signup applies, so a reset cannot be used to get
    // around it.
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      // End every OTHER session for this account.
      //
      // Someone resetting a password may be doing it because they think
      // somebody else has it. Leaving the other sessions signed in would
      // make the reset reassuring rather than effective. This one stays.
      await supabase.auth.signOut({ scope: "others" });

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (ready === null) {
    return <p className="text-sm text-slate-500">Checking your link…</p>;
  }

  if (!ready) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">This link can&apos;t be used</h1>
        <p className="mt-3 text-sm text-slate-600">
          Password links expire quickly, work once, and only in the browser
          that asked for them. Request a new one and open it in this browser.
        </p>
        <p className="mt-6 text-sm">
          <Link
            href="/forgot-password"
            className="font-medium text-sky-700 hover:underline"
          >
            Send a new link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <p className="mt-2 text-sm text-slate-600">
        This also signs out anywhere else your account is currently signed in.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}
