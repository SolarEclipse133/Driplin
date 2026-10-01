import { SkeletonLine, SkeletonList } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonLine className="h-6 w-40" />
      <div className="mt-6">
        <SkeletonList rows={5} label="Loading your properties" />
      </div>
    </div>
  );
}
