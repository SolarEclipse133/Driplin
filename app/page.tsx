import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * Public marketing landing page at "/". Logged-in visitors never see
 * it — the middleware sends them straight to /dashboard.
 */

const FEATURES = [
  {
    title: "Schedules fixed automatically",
    body: "Driplin reads every connected Rachio or Hunter Hydrawise controller, checks it against the current restrictions, and pushes a corrected schedule the moment a property drifts out of compliance.",
  },
  {
    title: "A verified stage, not a guess",
    body: "Lake levels are monitored nightly, but restrictions only change when a human confirms the official City of Austin declaration — every schedule change traces back to a dated, linked source.",
  },
  {
    title: "Board-ready reports",
    body: "One click produces a clean PDF per property: compliance history, violations caught and corrected, and estimated water savings for the period. Made to be forwarded to the board.",
  },
  {
    title: "Alerts before fines",
    body: "When a property goes out of compliance — or a controller needs a hands-on fix — the manager gets an SMS and email with exactly what to change.",
  },
  {
    title: "Your whole portfolio at a glance",
    body: "One dashboard: how many properties are compliant, what needs attention, and how much water your corrections have saved.",
  },
  {
    title: "Built for Central Texas",
    body: "Austin's address-digit watering days, Stage 1–4 time windows, and LCRA lake storage — encoded, cited, and kept current.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Connect your controllers",
    body: "Add your properties and link the smart irrigation controllers already installed — Rachio today, Hydrawise next.",
  },
  {
    n: "2",
    title: "Driplin keeps watch",
    body: "Every schedule is checked nightly against the verified drought stage. Violations get corrected automatically or flagged with clear instructions.",
  },
  {
    n: "3",
    title: "Show your work",
    body: "Auditable logs, a verified-stage label, and board-ready PDF reports whenever anyone asks how you stayed compliant.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-white text-slate-900">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo size="md" />
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
          >
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[28rem] w-[50rem] -translate-x-1/2 rounded-full bg-sky-100 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:pt-24">
          <p className="mx-auto inline-block rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
            For property managers &amp; HOAs in Central Texas
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Drought restrictions change.
            <br />
            <span className="bg-gradient-to-r from-sky-600 to-blue-700 bg-clip-text text-transparent">
              Your sprinklers keep up.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Driplin connects the smart irrigation controllers already installed
            at your properties and keeps every schedule compliant with Austin
            Water&apos;s current watering rules — automatically, auditably,
            provably.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-lg bg-sky-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-sky-800"
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
            >
              Log in
            </Link>
          </div>

          {/* Stylized product glimpse */}
          <div className="mx-auto mt-14 max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl shadow-sky-900/5">
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm">
              <span className="font-semibold text-sky-900">
                Stage 2 watering restrictions in effect
              </span>{" "}
              <span className="text-xs text-sky-700">
                verified Sep 12 — official source
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Properties", "24"],
                ["Compliant", "24/24"],
                ["Water saved", "38,250 gal"],
                ["Open alerts", "0"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {[
                ["Barton Creek Villas HOA", "Compliant"],
                ["Zilker Terrace Apartments", "Compliant"],
                ["Mueller Row Homes", "Corrected today"],
              ].map(([name, status]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                >
                  <span className="text-sm font-medium">{name}</span>
                  <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Compliance that runs itself
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            Watering violations mean fines, angry boards, and wasted water.
            Driplin makes them a non-event.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          How it works
        </h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-700 text-base font-bold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="rounded-2xl bg-gradient-to-r from-sky-600 to-blue-700 px-6 py-12 text-center text-white sm:px-12">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Be the manager whose properties are always compliant.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sky-100">
            Set up your portfolio in minutes. Connect a controller, and
            Driplin takes the watering schedule off your plate.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-base font-semibold text-sky-800 hover:bg-sky-50"
          >
            Create your account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <Logo size="sm" />
          <p className="max-w-md text-xs leading-relaxed text-slate-400">
            Driplin is an independent service and is not affiliated with or
            endorsed by Austin Water, the City of Austin, the LCRA, Rachio,
            or Hunter Industries.
          </p>
        </div>
      </footer>
    </div>
  );
}
