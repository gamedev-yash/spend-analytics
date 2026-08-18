"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useDashboardActiveFilterSummary } from "@/context/DashboardActiveFiltersContext";
import { ExportSnapshotModal } from "./ExportSnapshotModal";
import { cn } from "@/lib/utils";

interface ExportSnapshotButtonProps {
  /** id of the element to capture — every dashboard page wraps its canvas in this id. */
  targetId: string;
  /** Used to build the downloaded file's name. */
  dashboardTitle: string;
  className?: string;
}

/**
 * "Export Snapshot" header action shared by every dashboard page: opens the
 * ExportSnapshotModal so the user can choose PNG/PDF/PPTX format, PPT layout,
 * and metadata options before exporting `#targetId`.
 */
export function ExportSnapshotButton({ targetId, dashboardTitle, className }: ExportSnapshotButtonProps) {
  const [open, setOpen] = useState(false);
  const activeFiltersSummary = useDashboardActiveFilterSummary();

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Download className="h-3.5 w-3.5" />
        Export Snapshot
      </button>
      <ExportSnapshotModal
        open={open}
        onOpenChange={setOpen}
        targetId={targetId}
        dashboardTitle={dashboardTitle}
        activeFiltersSummary={activeFiltersSummary ?? undefined}
      />
    </div>
  );
}
