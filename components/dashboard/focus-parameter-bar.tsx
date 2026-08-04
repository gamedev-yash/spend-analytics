"use client";

import type { LucideIcon } from "lucide-react";
import { ThresholdSettings } from "@/components/dashboard/threshold-settings";
import { cn } from "@/lib/utils";

export interface FocusParameterDef<Id extends string = string> {
  id: Id;
  label: string;
  description?: string;
  icon: LucideIcon;
}

export interface FocusPresetDef<Id extends string = string> {
  id: string;
  label: string;
  parameterIds: readonly Id[];
}

interface FocusParameterBarProps<Id extends string> {
  parameters: readonly FocusParameterDef<Id>[];
  presets?: readonly FocusPresetDef<Id>[];
  activeParameters: readonly Id[];
  onToggleParameter: (parameterId: Id) => void;
  onApplyPreset?: (parameterIds: Id[]) => void;
  /** Card heading. Defaults to "Focus Parameters". */
  title?: string;
  /** Optional one-line hint under the heading, for pages whose chips need explaining. */
  description?: string;
  /** When set, shows the "Thresholds" editor for that page's alert targets. */
  thresholdsPageKey?: string;
}

/**
 * Horizontal quick-filter bar shared by dashboard pages: toggle which focus
 * areas drive canvas widget visibility, or jump to a preset. Pages own their
 * parameter registries and visibility logic — this renders chips only.
 */
export function FocusParameterBar<Id extends string>({
  parameters,
  presets,
  activeParameters,
  onToggleParameter,
  onApplyPreset,
  title = "Focus Parameters",
  description,
  thresholdsPageKey,
}: FocusParameterBarProps<Id>) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {title}
          </h3>
          {description && (
            <p className="text-xs text-slate-400 dark:text-slate-500">{description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {presets && onApplyPreset && (
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyPreset([...preset.parameterIds])}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-200"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
          {thresholdsPageKey && <ThresholdSettings pageKey={thresholdsPageKey} />}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {parameters.map((parameter) => {
          const active = activeParameters.includes(parameter.id);
          return (
            <button
              key={parameter.id}
              type="button"
              onClick={() => onToggleParameter(parameter.id)}
              aria-pressed={active}
              title={parameter.description}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
              )}
            >
              <parameter.icon className="h-4 w-4" />
              {parameter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
