"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronDown, SlidersHorizontal, UserRound } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

interface TopHeaderProps {
  filtersVisible: boolean;
  onToggleFilters: () => void;
}

export function TopHeader({ filtersVisible, onToggleFilters }: TopHeaderProps) {
  const pathname = usePathname();
  const activeItem = NAV_ITEMS.find((item) => pathname?.startsWith(item.href));

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-8 backdrop-blur transition-colors duration-200 ease-in-out dark:border-slate-800 dark:bg-slate-900/80">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {activeItem?.label ?? "Dashboard"}
        </h1>
        <p className="text-xs text-slate-400 dark:text-slate-500">Enterprise Procurement Analytics</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleFilters}
          aria-pressed={filtersVisible}
          className={cn(
            "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            filtersVisible
              ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </button>

        <div className="mx-2 h-6 w-px bg-slate-200 dark:bg-slate-800" />

        <ThemeToggle />

        <button
          type="button"
          aria-label="Notifications"
          className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <Bell className="h-5 w-5" />
        </button>

        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            User Profile
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
        </button>
      </div>
    </header>
  );
}
