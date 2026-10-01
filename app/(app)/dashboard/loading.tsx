import { SkeletonLine, SkeletonList } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonLine className="h-6 w-56" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <SkeletonLine className="h-3 w-2/3" />
            <SkeletonLine className="mt-3 h-6 w-1/2" />
          </div>
        ))}
      </div>
      <div className="mt-8">
        <SkeletonList rows={4} label="Loading your properties" />
      </div>
    </div>
  );
}
