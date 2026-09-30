import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { JoinForm } from "@/components/join-form";
import { findInvitation } from "./data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join your team",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Accepting an invitation.
 *
 * The email is fixed and shown, not editable: the invitation is bound
 * to that address, so letting someone change it here would only
 * produce a confusing failure after they had filled the form in.
 */
export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const invitation = await findInvitation(token);

  if (!invitation) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <Logo size="sm" />
        <h1 className="mt-6 text-xl font-semibold">This invitation isn&apos;t valid</h1>
        <p className="mt-2 text-sm text-slate-600">
          It may have been used already, withdrawn, or expired. Ask whoever
          invited you to send a new one.
        </p>
        <Link href="/login" className="mt-4 text-sm text-sky-700 underline">
          Already have an account? Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Logo size="sm" />
      <h1 className="mt-6 text-2xl font-semibold">
        Join {invitation.orgName}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {invitation.invitedBy
          ? `${invitation.invitedBy} invited you to `
          : "You've been invited to "}
        manage drought compliance with {invitation.orgName} on Driplin.
      </p>
      <JoinForm token={token} email={invitation.email} />
    </main>
  );
}
