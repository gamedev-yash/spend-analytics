import { Skeleton } from "@/components/ui/skeleton";

export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="mt-3 h-7 w-1/2" />
      <Skeleton className="mt-2 h-3 w-3/4" />
    </div>
  );
}

export function WidgetCardSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80 lg:p-6">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-2 h-3 w-1/2" />
      <Skeleton className="mt-4 w-full rounded-lg" style={{ height }} />
    </div>
  );
}

interface WidgetGridSkeletonProps {
  /** KPI tiles across the top ribbon; omit or pass 0 to skip the ribbon entirely. */
  kpiCount?: number;
  /** Chart/table cards in the 2-column grid below. */
  widgetCount: number;
  /** Chart body height inside each widget card — match the real widgets' height where it matters. */
  widgetHeight?: number;
}

/**
 * First-load placeholder for a dashboard page's client-side data fetch: an
 * N-card KPI ribbon (grid-cols-1 sm:grid-cols-2 lg:grid-cols-4) plus an
 * M-card 2-column widget grid, so nothing reflows when real data swaps in.
 *
 * Distinct from dashboard-skeleton.tsx's `DashboardSkeleton`, which is a
 * Next.js `loading.tsx` route-level Suspense fallback for a page's *server*
 * render. This one is for the *client*-side provider fetch that runs after
 * that — see each page's `isInitialLoad`/`isRevalidating` split: shown only
 * for a page's very first client fetch of a session, never on a later
 * filter-triggered refetch (that keeps the existing charts on screen instead
 * — see RevalidatingSection).
 */
export function WidgetGridSkeleton({ kpiCount = 0, widgetCount, widgetHeight = 280 }: WidgetGridSkeletonProps) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      {kpiCount > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: kpiCount }, (_, i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: widgetCount }, (_, i) => (
          <WidgetCardSkeleton key={i} height={widgetHeight} />
        ))}
      </div>
    </div>
  );
}
