import { SkeletonCard, SkeletonLine } from "@/components/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div aria-hidden>
        <SkeletonLine className="h-6 w-48" />
        <div className="mt-6 space-y-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </div>
      </div>
    </div>
  );
}
