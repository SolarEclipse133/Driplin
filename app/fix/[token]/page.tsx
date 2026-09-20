import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { VendorConfirmForm } from "@/components/vendor-confirm-form";
import { findWorkOrderByToken } from "./data";
import { completeWorkOrder } from "./actions";

export const dynamic = "force-dynamic";

// Keep this page out of search engines and stop the token leaking to
// other sites through the referrer header.
export const metadata: Metadata = {
  title: "Irrigation update",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size="md" />
        </div>
        {children}
      </div>
    </main>
  );
}

export default async function VendorFixPage({
  params,
}: PageProps<"/fix/[token]">) {
  const { token } = await params;
  const order = await findWorkOrderByToken(token);

  // Unknown, expired and cancelled links all look identical from the
  // outside, so a stranger poking at URLs learns nothing.
  if (!order || order.status === "cancelled") {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <h1 className="text-lg font-semibold">This link isn&apos;t valid</h1>
          <p className="mt-2 text-sm text-slate-600">
            It may have expired or already been used. Ask your client to
            send a new one.
          </p>
        </div>
      </Shell>
    );
  }

  if (order.status === "completed") {
    return (
      <Shell>
        <div className="rounded-2xl border border-green-200 bg-white p-6 text-center">
          <h1 className="text-lg font-semibold text-green-900">
            Already marked done
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            This job at {order.propertyName} was closed out
            {order.completedAt
              ? ` on ${new Date(order.completedAt).toLocaleDateString("en-US", {
                  timeZone: "America/Chicago",
                  dateStyle: "medium",
                })}`
              : ""}
            . Nothing else to do.
          </p>
        </div>
      </Shell>
    );
  }

  if (order.expired) {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <h1 className="text-lg font-semibold">This link has expired</h1>
          <p className="mt-2 text-sm text-slate-600">
            Ask your client to send a fresh one.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
          Irrigation update requested
        </p>
        <h1 className="mt-1 text-xl font-bold">{order.propertyName}</h1>
        <p className="mt-1 text-sm text-slate-500">{order.propertyAddress}</p>

        <div className="mt-4 rounded-xl bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            On {order.controllerName}, please make these changes:
          </p>
          {order.steps.length > 0 ? (
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-amber-900">
              {order.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-amber-900">
              Bring the watering schedule in line with the current
              restrictions.
            </p>
          )}
        </div>

        <div className="mt-5">
          <VendorConfirmForm
            action={completeWorkOrder}
            token={token}
            vendorName={order.vendorName}
          />
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        This link is just for this one job and expires on its own. Please
        don&apos;t forward it.
      </p>
    </Shell>
  );
}
