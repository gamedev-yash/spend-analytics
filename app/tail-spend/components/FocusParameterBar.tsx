"use client";

import { FOCUS_PARAMETERS, FOCUS_PRESETS, type FocusParameterId } from "./focusParams";
import { cn } from "@/lib/utils";

interface FocusParameterBarProps {
  activeParameters: FocusParameterId[];
  onToggleParameter: (parameterId: FocusParameterId) => void;
  onApplyPreset: (parameterIds: FocusParameterId[]) => void;
}

/** Horizontal quick-filter bar: toggle which focus areas drive canvas visibility, or jump to a preset. */
export function FocusParameterBar({ activeParameters, onToggleParameter, onApplyPreset }: FocusParameterBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Focus Parameters</h3>
        <div className="flex flex-wrap gap-2">
          {FOCUS_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplyPreset(preset.parameterIds)}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FOCUS_PARAMETERS.map((parameter) => {
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
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600 hover:text-slate-200"
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
