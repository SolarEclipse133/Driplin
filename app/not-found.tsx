import Link from "next/link";

/**
 * A page that is not there.
 *
 * Reached most often by an old link to a property that has since been
 * archived or deleted, so it says that rather than just "404" — the
 * archive is where someone in that position actually needs to go.
 */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-3 text-slate-600">
        This page doesn&apos;t exist. If you followed a link to a property,
        it may have been archived or removed from the portfolio — archived
        properties keep their full compliance record and are listed at the
        bottom of the properties page.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/properties"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          All properties
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
