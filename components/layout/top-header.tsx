"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronDown, UserRound } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function TopHeader() {
  const pathname = usePathname();
  const activeItem = NAV_ITEMS.find((item) => pathname?.startsWith(item.href));

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/80 px-8 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          {activeItem?.label ?? "Dashboard"}
        </h1>
        <p className="text-xs text-muted-foreground">Enterprise Procurement Analytics</p>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />

        <button
          type="button"
          aria-label="Notifications"
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
        </button>

        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 transition-colors hover:bg-muted"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium text-foreground">
            User Profile
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
