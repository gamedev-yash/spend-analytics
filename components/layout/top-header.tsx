"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronDown, UserRound } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";

export function TopHeader() {
  const pathname = usePathname();
  const activeItem = NAV_ITEMS.find((item) => pathname?.startsWith(item.href));

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-8 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          {activeItem?.label ?? "Dashboard"}
        </h1>
        <p className="text-xs text-slate-400">Enterprise Procurement Analytics</p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Notifications"
          className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <Bell className="h-5 w-5" />
        </button>

        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 transition-colors hover:bg-slate-50"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium text-slate-700">
            User Profile
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </div>
    </header>
  );
}
