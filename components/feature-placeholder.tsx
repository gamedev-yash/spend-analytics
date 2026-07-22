import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/nav";

export interface FeaturePlaceholderStat {
  label: string;
  value: string | number;
}

interface FeaturePlaceholderProps {
  /** Route this placeholder represents — must match a href in lib/nav.ts */
  href: string;
  /** Optional small stats proving the route's mock dataset is wired up */
  stats?: FeaturePlaceholderStat[];
  status?: string;
}

/**
 * Shared placeholder rendered by every route's page.tsx until the real
 * feature is built. Reads label/owner/description from NAV_ITEMS so the
 * sidebar and each page never fall out of sync.
 */
export function FeaturePlaceholder({
  href,
  stats,
  status = "Ready for development",
}: FeaturePlaceholderProps) {
  const item = NAV_ITEMS.find((navItem) => navItem.href === href);

  if (!item) {
    throw new Error(
      `FeaturePlaceholder: no nav item registered for route "${href}". Add it to lib/nav.ts.`
    );
  }

  const Icon = item.icon;

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <CardTitle>{item.label}</CardTitle>
          <p className="text-sm text-slate-400 dark:text-slate-500">{item.href}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {item.description}
        </p>

        <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Assigned to
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {item.owner}
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            {status}
          </span>
        </div>

        {stats && stats.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-800/60"
              >
                <p className="text-xs text-slate-400 dark:text-slate-500">{stat.label}</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
