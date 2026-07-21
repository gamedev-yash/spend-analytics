import { Skeleton } from "@/components/ui/skeleton";

/** Shared loading state for both Spend Overview routes — mirrors the real layout so there's no jump on hydrate. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </section>

      <Skeleton className="h-20 w-full" />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-80 w-full xl:col-span-2" />
        <Skeleton className="h-80 w-full" />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    </div>
  );
}
