import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { findBoardView } from "./data";

export const dynamic = "force-dynamic";

// A link pasted into meeting minutes should not end up in a search
// index, and should not leak its own token to anything it links out to.
export const metadata: Metadata = {
  title: "Compliance status",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const STATUS_STYLES = {
  compliant: { dot: "bg-green-500", text: "text-green-900", panel: "border-green-200 bg-green-50" },
  needs_attention: { dot: "bg-amber-500", text: "text-amber-900", panel: "border-amber-200 bg-amber-50" },
  unknown: { dot: "bg-slate-400", text: "text-slate-700", panel: "border-slate-200 bg-slate-50" },
} as const;

function when(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * What an HOA board sees.
 *
 * The board is who all of this is ultimately for: they see the fine,
 * and the manager answers to them. This page is the whole relationship
 * made visible — one property, current status, the rules in force, and
 * the source those rules were verified against.
 *
 * Read-only by construction. There is nothing here to click that
 * changes anything, and nothing about any other property.
 */
export default async function BoardPage({
  params,
}: PageProps<"/board/[token]">) {
  const { token } = await params;
  const view = await findBoardView(token);

  if (!view) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <Logo size="sm" />
        <h1 className="mt-6 text-xl font-semibold">This link isn&apos;t working</h1>
        <p className="mt-2 text-sm text-slate-600">
          It may have been replaced by a newer one, or turned off. Ask
          whoever manages the property for a current link.
        </p>
      </main>
    );
  }

  const style = STATUS_STYLES[view.status];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Logo size="sm" />

      <h1 className="mt-6 text-2xl font-semibold">{view.propertyName}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {view.address}
        {view.orgName ? ` · managed by ${view.orgName}` : ""}
      </p>

      <div className={`mt-6 rounded-xl border p-4 ${style.panel}`}>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
          <p className={`font-semibold ${style.text}`}>{view.statusLabel}</p>
        </div>
        {view.archivedAt ? (
          <p className="mt-1 text-xs text-slate-600">
            This property left the portfolio on {when(view.archivedAt)}. The
            record below covers the period up to then; Driplin has not checked
            it since.
          </p>
        ) : (
          view.checkedAt && (
            <p className="mt-1 text-xs text-slate-500">
              Last checked {when(view.checkedAt)}
            </p>
          )
        )}
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Rules in force</h2>
        <p className="mt-1 text-sm text-slate-500">
          {view.jurisdictionName} · {view.utility}
        </p>
        <p className="mt-2 font-medium">{view.stageName}</p>
        <p className="mt-1 text-sm text-slate-600">{view.stageSummary}</p>
        <p className="mt-2 text-xs text-slate-500">
          {view.stageConfirmedAt
            ? `Verified against the utility's own notice on ${new Date(view.stageConfirmedAt).toLocaleDateString("en-US", { timeZone: "America/Chicago", dateStyle: "medium" })}.`
            : "Standing year-round rules for this city."}{" "}
          <a
            href={view.sourceLink ?? view.officialUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sky-700 underline"
          >
            Read it
          </a>
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Recent activity</h2>
        {view.activity.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nothing recorded yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {view.activity.map((a, i) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm text-slate-800">{a.summary}</p>
                <p className="mt-0.5 text-xs text-slate-400">{when(a.date)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-400">
        Monitored by Driplin. This page is read-only and shows this property
        only.
      </p>
    </main>
  );
}
