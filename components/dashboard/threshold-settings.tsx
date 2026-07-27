"use client";

import { useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useThresholds } from "@/context/ThresholdsContext";
import { formatThresholdValue, thresholdConditionLabel } from "@/lib/threshold-format";
import type { ThresholdConfig } from "@/types/thresholds";
import { cn } from "@/lib/utils";

const UNIT_STEP: Record<NonNullable<ThresholdConfig["unit"]> | "default", number> = {
  currency: 1_000,
  percent: 1,
  days: 1,
  count: 1,
  default: 1,
};

function ThresholdRow({
  config,
  onCommit,
}: {
  config: ThresholdConfig;
  onCommit: (value: number) => void;
}) {
  // Local draft so typing doesn't fight the controlled value; re-derived when
  // the config changes externally (e.g. the page's own slider moved it) via
  // the setState-during-render "derived state" pattern — no effects.
  const [draft, setDraft] = useState(String(config.targetValue));
  const [lastTarget, setLastTarget] = useState(config.targetValue);
  if (config.targetValue !== lastTarget) {
    setLastTarget(config.targetValue);
    setDraft(String(config.targetValue));
  }

  function handleChange(raw: string) {
    setDraft(raw);
    if (raw.trim() === "") return;
    const value = Number(raw);
    if (Number.isFinite(value)) onCommit(value);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={`threshold-${config.id}`}
          className="text-xs font-medium text-slate-700 dark:text-slate-200"
          title={config.description}
        >
          {config.label}
        </label>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          target {thresholdConditionLabel(config)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={`threshold-${config.id}`}
          type="number"
          value={draft}
          step={UNIT_STEP[config.unit ?? "default"]}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm tabular-nums text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-slate-500"
        />
        <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          {formatThresholdValue(config.targetValue, config.unit)}
        </span>
      </div>
    </div>
  );
}

/**
 * "Thresholds" popover for a page's alert targets. Edits apply live —
 * every KPI badge, chart accent, and table pill re-evaluates immediately —
 * and persist to localStorage['app_thresholds'] via ThresholdsContext.
 */
export function ThresholdSettings({ pageKey, className }: { pageKey: string; className?: string }) {
  const { thresholdsForPage, setTargetValue, resetPage, pageHasOverrides } = useThresholds();
  const thresholds = thresholdsForPage(pageKey);
  const dirty = pageHasOverrides(pageKey);

  if (thresholds.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "relative inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
          className
        )}
        title="Adjust alert thresholds for this dashboard"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Thresholds
        {dirty && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500" />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Alert thresholds
          </p>
          <button
            type="button"
            onClick={() => resetPage(pageKey)}
            disabled={!dirty}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title="Reset this page's thresholds to defaults"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
        <div className="mt-1 space-y-3">
          {thresholds.map((config) => (
            <ThresholdRow
              key={config.id}
              config={config}
              onCommit={(value) => setTargetValue(config.id, value)}
            />
          ))}
        </div>
        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-400 dark:border-slate-800 dark:text-slate-500">
          Changes apply live to KPI badges, chart accents, and table pills, and persist in this
          browser.
        </p>
      </PopoverContent>
    </Popover>
  );
}
