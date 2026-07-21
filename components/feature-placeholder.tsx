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
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <CardTitle>{item.label}</CardTitle>
          <p className="text-sm text-muted-foreground">{item.href}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {item.description}
        </p>

        <div className="flex items-center justify-between rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Assigned to
            </p>
            <p className="text-sm font-semibold text-foreground">
              {item.owner}
            </p>
          </div>
          <span className="rounded-full bg-[#fab21926] px-2.5 py-1 text-xs font-medium text-[#9a6b00] dark:text-[#fab219]">
            {status}
          </span>
        </div>

        {stats && stats.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-border bg-background px-3 py-2"
              >
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-sm font-semibold text-foreground">
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
