"use client";

import { ArrowRight, Compass } from "lucide-react";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";

interface RedirectCardProps {
  redirect: { key: DashboardKey; label: string; route: string };
  onNavigate: () => void;
}

/**
 * Visual upgrade of the existing "go to another dashboard" affordance —
 * same data (`m.redirect`) and same navigation behavior (passed in via
 * `onNavigate`, still stashes the pending prompt + routes), just presented
 * as an intelligent recommendation card instead of a plain outlined button.
 */
export function RedirectCard({ redirect, onNavigate }: RedirectCardProps) {
  return (
    <div className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/50">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
        <Compass className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          This question belongs to the {redirect.label} dashboard.
        </p>
        <button
          type="button"
          onClick={onNavigate}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:focus-visible:ring-offset-slate-900"
        >
          Open {redirect.label} Dashboard
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
