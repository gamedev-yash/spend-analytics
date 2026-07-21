"use client";

import { useFilterSlotContent } from "@/context/FilterContext";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  visible: boolean;
}

/**
 * Pure container slot for the shell's Filter Drawer — owns only the chrome
 * (width/position/animation/theme), not any specific filter. Pages register
 * their own filter UI via useFilterSlot() (see context/FilterContext.tsx);
 * this renders whatever is currently registered, or nothing if no route has
 * registered anything.
 */
export function FilterBar({ visible }: FilterBarProps) {
  const content = useFilterSlotContent();

  return (
    <aside
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        "hidden shrink-0 overflow-hidden border-slate-200 bg-slate-50/60 transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-900/40 lg:block",
        visible ? "w-[280px] border-r opacity-100" : "w-0 border-r-0 opacity-0"
      )}
    >
      <div className="flex h-[calc(100vh-4rem)] w-[280px] flex-col overflow-y-auto px-5 py-6">
        {content}
      </div>
    </aside>
  );
}
