"use client";

import { useState } from "react";
import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/password-field";

const LINK_ERRORS: Record<string, string> = {
  link_invalid: "That link was incomplete. Request a new one below.",
  link_expired:
    "That link has expired, been used already, or was opened in a different browser than the one that asked for it. Request a new one below.",
};

/**
 * Why /auth/callback sent someone back here, if it did.
 *
 * Split out and wrapped in Suspense below: useSearchParams opts a route
 * out of static prerendering unless it sits behind a boundary, and this
 * page is otherwise static.
 */
function LinkErrorNotice() {
  const searchParams = useSearchParams();
  const message = LINK_ERRORS[searchParams.get("error") ?? ""] ?? null;
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {message}
    </p>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(
          signInError.message === "Invalid login credentials"
            ? "Email or password is incorrect."
            : signInError.message
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h2 className="text-xl font-semibold">Log in</h2>

      <Suspense fallback={null}>
        <LinkErrorNotice />
      </Suspense>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="you@company.com"
          />
        </div>

        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />

        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm">
        <Link
          href="/forgot-password"
          className="font-medium text-sky-700 hover:underline"
        >
          Forgot your password?
        </Link>
      </p>

      <p className="mt-4 text-center text-sm text-slate-600">
        New to Driplin?{" "}
        <Link href="/signup" className="font-medium text-sky-700 underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
