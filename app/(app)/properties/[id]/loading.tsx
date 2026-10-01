import { SkeletonCard, SkeletonLine } from "@/components/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading this property</span>
      <div aria-hidden>
        <SkeletonLine className="h-7 w-64" />
        <SkeletonLine className="mt-3 h-3 w-80" />
        <div className="mt-8 space-y-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    </div>
  );
}
