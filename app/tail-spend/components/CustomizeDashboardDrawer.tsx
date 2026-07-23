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
import { DASHBOARD_WIDGET_GROUPS, type WidgetId } from "./dashboardParams";

interface CustomizeDashboardDrawerProps {
  isVisible: (widgetId: WidgetId) => boolean;
  onToggleWidget: (widgetId: WidgetId) => void;
  onResetToDefault: () => void;
}

/** Trigger button + slide-over drawer for toggling which Tail Spend widgets are shown. */
export function CustomizeDashboardDrawer({
  isVisible,
  onToggleWidget,
  onResetToDefault,
}: CustomizeDashboardDrawerProps) {
  return (
    <Sheet>
      <SheetTrigger className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700">
        <SlidersHorizontal className="h-4 w-4" />
        Customize View
      </SheetTrigger>

      <SheetContent className="w-full max-w-sm sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Custom Dashboard Parameters</SheetTitle>
          <SheetDescription>
            Choose which widgets appear on this dashboard. Your selection is saved on this device.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6">
          {DASHBOARD_WIDGET_GROUPS.map((group) => (
            <FilterGroup key={group.id} title={group.title}>
              {group.widgets.map((widget) => (
                <FilterToggle
                  key={widget.id}
                  label={widget.label}
                  checked={isVisible(widget.id)}
                  onChange={() => onToggleWidget(widget.id)}
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
