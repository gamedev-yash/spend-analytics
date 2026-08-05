"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Download, Loader2 } from "lucide-react";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { DASHBOARD_PAGE_BACKGROUND, exportDashboardSnapshot } from "@/lib/snapshot";
import { cn } from "@/lib/utils";

interface ExportSnapshotButtonProps {
  /** id of the element to capture — every dashboard page wraps its canvas in this id. */
  targetId: string;
  /** Used to build the downloaded file's name. */
  dashboardTitle: string;
  className?: string;
}

/**
 * "Export Snapshot" header action shared by every dashboard page: captures
 * `#targetId` as a high-resolution PNG (html-to-image) matching the active
 * theme's page background, and downloads it. Shows a spinner while the
 * capture is in flight.
 */
export function ExportSnapshotButton({ targetId, dashboardTitle, className }: ExportSnapshotButtonProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useHasMounted();
  const isDark = mounted && resolvedTheme === "dark";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      await exportDashboardSnapshot(targetId, dashboardTitle, {
        backgroundColor: isDark ? DASHBOARD_PAGE_BACKGROUND.dark : DASHBOARD_PAGE_BACKGROUND.light,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export snapshot.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={handleExport}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {busy ? "Exporting…" : "Export Snapshot"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
