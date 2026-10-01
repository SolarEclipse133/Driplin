"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Ask for a reset link.
 *
 * There was no way back into a Driplin account at all. Someone who forgot
 * their password was locked out of their own compliance record until a
 * human intervened in the database.
 *
 * The confirmation below is deliberately the same whether or not the
 * address has an account. Saying "no account found" would turn this form
 * into a way to test which property managers use Driplin, which is both a
 * privacy leak and useful to someone preparing a phishing email.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      // The link lands on /auth/callback, which turns the one-time code
      // into a session and then sends them on to set a new password.
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      // Shown regardless of the outcome, on purpose — see above.
      setSent(true);
    } catch {
      setError("Could not send that just now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="mt-3 text-sm text-slate-600">
          If <span className="font-medium">{email.trim()}</span> has a Driplin
          account, a link to set a new password is on its way. It expires
          shortly, and it only works in this browser — open it here rather
          than forwarding it on.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Nothing arrived? Check spam, then{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-medium text-sky-700 underline"
          >
            try a different address
          </button>
          .
        </p>
        <p className="mt-6 text-sm">
          <Link href="/login" className="font-medium text-sky-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-sm text-slate-600">
        Enter the address you sign in with and we&apos;ll email you a link.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            required
          />
        </label>

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
          {submitting ? "Sending…" : "Email me a link"}
        </button>
      </form>

      <p className="mt-6 text-sm">
        <Link href="/login" className="font-medium text-sky-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
