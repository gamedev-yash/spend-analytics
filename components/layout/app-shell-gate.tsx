"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DashboardShell } from "./dashboard-shell";

// Routes that render their OWN full-page chrome instead of the shared
// sidebar/header/filter-drawer shell — currently just the standalone AI
// Assistant view (app/assistant/page.tsx), which needs to fill the entire
// viewport with no dashboard background behind it.
const STANDALONE_ROUTE_PREFIXES = ["/assistant"];

interface AppShellGateProps {
  children: ReactNode;
}

/** Per-route decision between the normal dashboard chrome (DashboardShell) and rendering `children` bare — see STANDALONE_ROUTE_PREFIXES. */
export function AppShellGate({ children }: AppShellGateProps) {
  const pathname = usePathname();
  const isStandalone = pathname ? STANDALONE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) : false;
  if (isStandalone) return <>{children}</>;
  return <DashboardShell>{children}</DashboardShell>;
}
