import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopHeader } from "@/components/layout/top-header";

interface DashboardShellProps {
  children: ReactNode;
}

/**
 * Single layout wrapper shared by every route: fixed sidebar and sticky top
 * header. Routes only ever render their own page content — no page re-implements
 * this chrome.
 */
export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="pl-64">
        <TopHeader />
        <main className="min-w-0 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
