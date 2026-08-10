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
    <div className="mt-3 flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 dark:border-indigo-900/60 dark:bg-indigo-950/30">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white">
        <Compass className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
          This question belongs to the {redirect.label} dashboard.
        </p>
        <button
          type="button"
          onClick={onNavigate}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900"
        >
          Open {redirect.label} Dashboard
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
