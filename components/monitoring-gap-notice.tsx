import Link from "next/link";
import type { MonitoringGap } from "@/lib/rules/monitoring-gap";

/**
 * The properties Driplin is not watching.
 *
 * Reachable in one step after a bulk import: forty properties in the
 * portfolio, nothing connected to any of them, and a dashboard that said
 * "Compliant 0/40" as though they had all failed. They had not failed.
 * Driplin knew nothing about them, and said nothing about knowing nothing.
 *
 * Deliberately not dismissible. It is not a tip; it is a statement that
 * the thing the customer is paying for is not happening yet.
 */
export function MonitoringGapNotice({
  gap,
  message,
}: {
  gap: MonitoringGap;
  message: string;
}) {
  const listed = [...gap.noController, ...gap.lostContact];
  const shown = listed.slice(0, 6);

  return (
    <div
      role="alert"
      className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4"
    >
      <p className="text-sm font-semibold text-amber-900">{message}</p>

      {gap.noController.length > 0 && (
        <p className="mt-2 text-sm text-amber-900">
          Connect a controller to each one, or record what an unconnected
          timer is set to, and Driplin will start checking it tonight.
        </p>
      )}
      {gap.lostContact.length > 0 && (
        <p className="mt-2 text-sm text-amber-900">
          For the ones Driplin can no longer read, the vendor connection
          usually needs reauthorising — open the property to see which.
        </p>
      )}

      <ul className="mt-3 flex flex-wrap gap-2">
        {shown.map((p) => (
          <li key={p.id}>
            <Link
              href={`/properties/${p.id}`}
              className="inline-block rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              {p.name}
            </Link>
          </li>
        ))}
        {listed.length > shown.length && (
          <li className="self-center text-xs text-amber-900">
            and {listed.length - shown.length} more —{" "}
            <Link href="/properties" className="underline">
              see all properties
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
