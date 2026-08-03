"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Trash2 } from "lucide-react";
import { DashboardGrid } from "@/components/generated-dashboard/dashboard-grid";
import { WidgetGridSkeleton } from "@/components/dashboard/widget-grid-skeleton";
import {
  deleteGeneratedDashboard,
  useGeneratedDashboard,
  useGeneratedDashboardsReady,
} from "@/lib/generated-dashboard/store";

// Read-only viewer for an AI-generated dashboard: no editing, no add-widget
// affordance, no AI assistant hook-up. Everything the page needs (plan,
// widgets, raw rows) already lives in the stored GeneratedDashboard record.

function EmptyShell({ title, message, children }: { title: string; message: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900/60">
      <LayoutDashboard className="h-8 w-8 text-slate-400 dark:text-slate-600" />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {children}
    </div>
  );
}

export default function GeneratedDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const dashboard = useGeneratedDashboard(id);
  const ready = useGeneratedDashboardsReady();

  // Store hydrates on the client, so "not found" is only real once ready.
  if (!ready) return <WidgetGridSkeleton widgetCount={4} />;

  if (!dashboard) {
    return (
      <EmptyShell
        title="Dashboard not found"
        message="This generated dashboard no longer exists in this browser. Generated dashboards are stored locally, so a link opened elsewhere — or after clearing site data — won't resolve. There's nothing here to delete."
      >
        <Link
          href="/"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Back home
        </Link>
      </EmptyShell>
    );
  }

  const createdAt = new Date(dashboard.createdAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function handleDelete() {
    deleteGeneratedDashboard(id);
    router.push("/");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold text-slate-900 dark:text-slate-100">{dashboard.title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Generated from {dashboard.sourceFileName} · {dashboard.rows.length.toLocaleString("en-IN")} rows · {createdAt}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 shadow-sm transition-colors hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Dashboard
        </button>
      </div>

      <DashboardGrid plan={dashboard.plan} widgets={dashboard.widgets} rows={dashboard.rows} />
    </div>
  );
}
