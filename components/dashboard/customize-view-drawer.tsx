"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FilterGroup, FilterToggle } from "@/components/ui/filter-controls";

export interface CustomizeWidgetDef<Id extends string = string> {
  id: Id;
  label: string;
}

export interface CustomizeWidgetGroupDef<Id extends string = string> {
  id: string;
  title: string;
  widgets: readonly CustomizeWidgetDef<Id>[];
}

interface CustomizeViewDrawerProps<Id extends string> {
  groups: readonly CustomizeWidgetGroupDef<Id>[];
  isWidgetEnabled: (widgetId: Id) => boolean;
  onToggleWidgetEnabled: (widgetId: Id) => void;
  onResetToDefault: () => void;
  title?: string;
  description?: string;
}

/**
 * Trigger button + slide-over drawer for the advanced per-widget override,
 * shared by every dashboard page. Independent of (and layered on top of) a
 * page's Focus Parameter bar — a widget still needs an active focus tag to
 * render even if it's enabled here.
 */
export function CustomizeViewDrawer<Id extends string>({
  groups,
  isWidgetEnabled,
  onToggleWidgetEnabled,
  onResetToDefault,
  title = "Custom Dashboard Parameters",
  description = "Override which widgets appear, independent of the Focus Parameters bar above. Your selection is saved on this device.",
}: CustomizeViewDrawerProps<Id>) {
  return (
    <Sheet>
      <SheetTrigger className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700">
        <SlidersHorizontal className="h-4 w-4" />
        Customize View
      </SheetTrigger>

      <SheetContent className="w-full max-w-sm sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6">
          {groups.map((group) => (
            <FilterGroup key={group.id} title={group.title}>
              {group.widgets.map((widget) => (
                <FilterToggle
                  key={widget.id}
                  label={widget.label}
                  checked={isWidgetEnabled(widget.id)}
                  onChange={() => onToggleWidgetEnabled(widget.id)}
                />
              ))}
            </FilterGroup>
          ))}
        </div>

        <SheetFooter className="flex-row items-center justify-between border-t border-border">
          <button
            type="button"
            onClick={onResetToDefault}
            className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Default
          </button>
          <SheetClose className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300">
            Done
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
