"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  function validate(): string | null {
    if (!fullName.trim()) return "Please enter your name.";
    if (!companyName.trim()) return "Please enter your company name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Please enter a valid email address.";
    if (password.length < 8)
      return "Password must be at least 8 characters long.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Passed to the database trigger that creates the
          // organization and profile rows for this new account.
          data: {
            full_name: fullName.trim(),
            company_name: companyName.trim(),
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.session) {
        // Signed in immediately (email confirmation disabled).
        router.push("/dashboard");
        router.refresh();
      } else {
        // Email confirmation is enabled in Supabase.
        setNeedsEmailConfirm(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (needsEmailConfirm) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p className="mt-3 text-sm text-slate-600">
          We sent a confirmation link to <strong>{email}</strong>. Click it,
          then come back and{" "}
          <Link href="/login" className="text-sky-700 underline">
            log in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-xl font-semibold">Create your account</h2>
      <p className="mt-1 text-sm text-slate-500">
        For property management companies and HOA managers.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium">
            Your name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="Jordan Rivera"
          />
        </div>

        <div>
          <label htmlFor="companyName" className="block text-sm font-medium">
            Company name
          </label>
          <input
            id="companyName"
            type="text"
            autoComplete="organization"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="Hill Country Property Management"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Work email
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="At least 8 characters"
          />
        </div>

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
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-sky-700 underline">
          Log in
        </Link>
      </p>
    </>
  );
}
