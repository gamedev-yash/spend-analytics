import { usePalette } from "@/hooks/use-palette";

interface Row {
  label: string;
  value: string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  heading?: string;
  rows: Row[];
}

/** Shared tooltip shell — a value is never gated behind hover-only; this only enhances. */
export function ChartTooltipCard({ active, heading, rows }: ChartTooltipProps) {
  const palette = usePalette();
  if (!active || rows.length === 0) return null;

  return (
    <div
      className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
      style={{ borderColor: palette.ink.grid }}
    >
      {heading && <p className="mb-1.5 font-medium text-popover-foreground">{heading}</p>}
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            {row.color && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="text-muted-foreground">{row.label}</span>
            <span className="ml-auto font-medium tabular-nums text-popover-foreground">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
