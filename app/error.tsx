"use client";

/**
 * What a customer sees when something in Driplin breaks.
 *
 * There was no error boundary at all, so an unhandled failure showed
 * Next's bare default page. For a compliance product that is worse than
 * ugly: the person cannot tell whether the problem is cosmetic or whether
 * the record they are relying on has been lost.
 *
 * So this says the three things they need: their data is intact, the
 * nightly checks are unaffected, and what to do next.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-slate-600">
        This page failed to load. Nothing has been changed or lost —
        Driplin&apos;s record of your properties is intact, and the nightly
        compliance checks run independently of this page.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Back to dashboard
        </a>
      </div>

      {/* The digest is the only handle on this specific failure in the
          server logs, so it is shown rather than hidden. It carries no
          detail of its own, which is why showing it is safe. */}
      {error.digest && (
        <p className="mt-6 text-xs text-slate-500">
          If you get in touch, quote this reference:{" "}
          <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </main>
  );
}
