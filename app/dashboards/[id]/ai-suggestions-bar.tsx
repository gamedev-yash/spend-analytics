"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { addWidget } from "@/lib/custom-dashboards-store";
import { generatePermutationSuggestions } from "@/lib/ai/widget-parser";
import { normalizeKey } from "@/lib/dataset-rows";
import type { Dataset } from "@/context/DatasetsContext";
import type { CustomDashboard, WidgetConfig } from "@/types/custom-dashboard";

interface AiSuggestionsBarProps {
  dashboard: CustomDashboard;
  dataset: Dataset;
}

/** Two widgets are "the same chart" if they plot the same thing, whatever they're titled. */
function widgetSignature(widget: Pick<WidgetConfig, "chartType" | "xAxisColumn" | "yAxisColumn" | "aggregation">): string {
  return [
    widget.chartType,
    normalizeKey(widget.xAxisColumn ?? ""),
    normalizeKey(widget.yAxisColumn ?? ""),
    widget.aggregation ?? "",
  ].join("|");
}

/**
 * Chip labels keep the whole title — the "X by Y" phrasing is what
 * distinguishes one suggestion from another (an "Amount by Region" donut vs an
 * "Amount by Country" one), so trimming the dimension would make them
 * ambiguous. Only genuinely long titles get truncated.
 */
function chipLabel(widget: WidgetConfig): string {
  const title = widget.title;
  return `Add ${title.length > 38 ? `${title.slice(0, 37)}…` : title}`;
}

/**
 * "AI Quick Suggestions" banner: up to three chart permutations this dashboard
 * doesn't already have, each added with one click. Suggestions are computed
 * locally from the bound dataset's columns, so the bar works with no API key
 * and costs nothing to render.
 */
export function AiSuggestionsBar({ dashboard, dataset }: AiSuggestionsBarProps) {
  // Locally dismissed for this mount — the store is the source of truth for
  // what's already on the dashboard, so no persistence needed here.
  const [dismissed, setDismissed] = useState<string[]>([]);

  const suggestions = useMemo(() => {
    const existing = new Set(dashboard.widgets.map(widgetSignature));
    return generatePermutationSuggestions(dataset.columns)
      .filter((w) => !existing.has(widgetSignature(w)) && !dismissed.includes(widgetSignature(w)))
      .slice(0, 3);
  }, [dashboard.widgets, dataset.columns, dismissed]);

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 dark:border-violet-900/60 dark:bg-violet-950/20">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        <Sparkles className="h-3.5 w-3.5" />
        AI Quick Suggestions
      </span>
      {suggestions.map((widget) => (
        <button
          key={widget.id}
          type="button"
          title={widget.title}
          onClick={() => {
            addWidget(dashboard.id, widget);
            setDismissed((prev) => [...prev, widgetSignature(widget)]);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-800 shadow-sm transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-300 dark:hover:bg-violet-950/60"
        >
          <Plus className="h-3.5 w-3.5" />
          {chipLabel(widget)}
        </button>
      ))}
    </div>
  );
}
