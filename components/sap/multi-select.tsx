"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  allLabel?: string;
}

/** Popover + checkbox list — shadcn's Select is single-value, and this dashboard's
 *  Business Unit / Category filters are explicitly multi-select per spec. */
export function MultiSelect({ label, options, selected, onChange, allLabel = "All" }: MultiSelectProps) {
  const triggerLabel =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className="w-[200px] justify-between bg-background font-normal">
              <span className="truncate">{triggerLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </Button>
          }
        />
        <PopoverContent className="w-[220px] p-2" align="start">
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mb-1 w-full rounded px-2 py-1 text-left text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Clear selection
              </button>
            )}
            {options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox checked={selected.includes(option.value)} onCheckedChange={() => toggle(option.value)} />
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
