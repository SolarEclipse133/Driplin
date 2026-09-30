"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Creates the account and joins the inviting company.
 *
 * The token is passed through signup metadata to the database trigger,
 * which is the only thing that decides which organization this account
 * lands in. Nothing here can nominate a company.
 */
export function JoinForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) return setError("Please enter your name.");
    if (password.length < 8)
      return setError("Password must be at least 8 characters long.");

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            // Verified inside the trigger against a stored hash.
            invitation_token: token,
          },
        },
      });
      if (signUpError) return setError(signUpError.message);
      if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setNeedsConfirm(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (needsConfirm) {
    return (
      <p className="mt-6 rounded-md bg-sky-50 px-3 py-3 text-sm text-sky-900">
        Check your email to confirm your address, then sign in.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label className="block text-sm font-medium">Email</label>
        <input
          value={email}
          readOnly
          className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
        />
        <p className="mt-1 text-xs text-slate-500">
          This invitation only works for this address.
        </p>
      </div>
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium">
          Your name
        </label>
        <input
          id="full_name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Choose a password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {submitting ? "Creating your account…" : "Join"}
      </button>
    </form>
  );
}
