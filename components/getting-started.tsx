import Link from "next/link";
import type { SetupProgress } from "@/lib/onboarding/progress";

/**
 * The first thing a new account sees.
 *
 * Shown only while setup is incomplete, and gone for good afterwards: a
 * checklist that lingers once it is finished is clutter, and worse, it
 * makes a working account look unfinished.
 */
export function GettingStarted({ progress }: { progress: SetupProgress }) {
  if (progress.complete) return null;

  return (
    <section
      aria-labelledby="getting-started"
      className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="getting-started" className="text-base font-semibold text-sky-950">
          Getting Driplin working
        </h2>
        <p className="text-xs font-medium text-sky-900">
          {progress.doneCount} of {progress.steps.length} done
        </p>
      </div>

      <ol className="mt-4 space-y-4">
        {progress.steps.map((step, i) => (
          <li key={step.id} className="flex gap-3">
            {/* Number, tick, or the one you are on — distinguishable
                without relying on colour. */}
            <span
              aria-hidden
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                step.done
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : step.current
                    ? "border-sky-700 bg-white text-sky-900"
                    : "border-slate-300 bg-white text-slate-400"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </span>

            <div className="min-w-0">
              <p
                className={`text-sm font-medium ${
                  step.done ? "text-slate-500" : "text-slate-900"
                }`}
              >
                {step.title}
                {step.done && <span className="sr-only"> — done</span>}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">{step.detail}</p>

              {step.current && step.href && step.action && (
                <Link
                  href={step.href}
                  className="mt-2 inline-block rounded-md bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-800"
                >
                  {step.action}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
