"use client";

import { formatInr } from "@/lib/sap/format-inr";
import { cn } from "@/lib/utils";
import { luminance, useFragTheme } from "./fragTheme";
import { useFragmentation } from "./fragmentationStore";

/**
 * View 1 — Fragmentation Heatmap (pure CSS grid, no chart library).
 * BU rows × Category L1 columns, colored by distinct supplier count;
 * dark-red cells are fragmentation hotspots. Click a cell to cross-filter,
 * click it again to clear.
 */
export function FragmentationHeatmap() {
  const { derived, crossFilter, toggleHeatmapCell } = useFragmentation();
  const theme = useFragTheme();
  const { plantNames, l1Order, counts, spend, maxCount } = derived.heatmap;

  if (plantNames.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        No data for the current selection
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="grid gap-0.5"
          style={{
            gridTemplateColumns: `minmax(110px, 1.4fr) repeat(${l1Order.length}, minmax(44px, 1fr))`,
          }}
        >
          {/* header row: rotated L1 labels */}
          <div />
          {l1Order.map((l1) => (
            <div key={l1} className="flex h-20 items-end justify-center overflow-visible pb-1">
              <span
                className="origin-bottom-left -rotate-[35deg] whitespace-nowrap text-[10px] leading-none text-slate-500 dark:text-slate-400"
                title={l1}
              >
                {l1.length > 16 ? `${l1.slice(0, 15)}…` : l1}
              </span>
            </div>
          ))}

          {plantNames.map((plant, rowIdx) => (
            <div key={plant} className="contents">
              <div
                className="flex items-center truncate pr-2 text-xs font-medium text-slate-600 dark:text-slate-300"
                title={plant}
              >
                {plant}
              </div>
              {l1Order.map((l1, colIdx) => {
                const count = counts[rowIdx][colIdx];
                const cellSpend = spend[rowIdx][colIdx];
                const intensity = maxCount > 0 ? count / maxCount : 0;
                const background = theme.heatColor(intensity);
                const isFocused =
                  crossFilter?.plantName === plant &&
                  crossFilter?.categoryL1 === l1 &&
                  !crossFilter?.categoryL2;
                return (
                  <button
                    key={l1}
                    type="button"
                    onClick={() => toggleHeatmapCell(plant, l1)}
                    title={`${plant} × ${l1}\nSuppliers: ${count}\nSpend: ${formatInr(cellSpend, 2)}`}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-[3px] text-[11px] font-semibold transition-transform hover:scale-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      isFocused && "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900"
                    )}
                    style={{
                      backgroundColor: background,
                      color: luminance(background) > 150 ? "#1e293b" : "#ffffff",
                    }}
                  >
                    {count}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* legend */}
      <div className="mt-3 flex shrink-0 items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
        <span>Fewer suppliers</span>
        <div
          className="h-2 w-32 rounded-full"
          style={{
            background: `linear-gradient(to right, ${[0, 0.25, 0.45, 0.65, 0.85, 1]
              .map((t) => theme.heatColor(t))
              .join(", ")})`,
          }}
        />
        <span>More suppliers</span>
      </div>
    </div>
  );
}
