/**
 * Placeholder shapes shown while a page is being built on the server.
 *
 * There were no loading states anywhere, so every navigation left the old
 * screen frozen until the new one was ready — seconds, on a cold start
 * against several round trips. The reasonable conclusion for someone
 * looking at an unchanged screen is that the click did not register, so
 * they click again.
 *
 * These are deliberately dull: enough shape to say "this is arriving" and
 * roughly where, without pretending to be the content.
 */
export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div className={`h-4 animate-pulse rounded bg-slate-200 ${className}`} />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <SkeletonLine className="w-1/3" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine key={i} className={i % 2 ? "w-2/3" : "w-5/6"} />
        ))}
      </div>
    </div>
  );
}

/**
 * A list of rows, as the properties and dashboard pages show.
 *
 * Announced politely to assistive technology: a screen reader should say
 * that something is loading rather than reading out a stack of empty
 * boxes, or silently nothing.
 */
export function SkeletonList({
  rows = 4,
  label = "Loading",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="space-y-2" aria-hidden>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="w-1/2 space-y-2">
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="h-3 w-5/6" />
            </div>
            <SkeletonLine className="h-6 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
