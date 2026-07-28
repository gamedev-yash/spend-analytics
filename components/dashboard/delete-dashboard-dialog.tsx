"use client";

import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { deleteDashboard } from "@/lib/custom-dashboards-store";

interface DeleteDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  dashboardTitle: string;
  /**
   * Navigate to /tail-spend after deleting. Pass true when the dashboard
   * being deleted is the one currently on screen (the header delete action,
   * or a sidebar delete of the active dashboard) — false lets a sidebar
   * delete of an unrelated dashboard remove it from the list without
   * yanking the user off whatever page they're looking at.
   */
  redirectAfterDelete: boolean;
}

/**
 * Shared confirmation modal for deleting a custom dashboard — used by both
 * the header's "Delete Dashboard" button and each sidebar row's trash icon.
 */
export function DeleteDashboardDialog({
  open,
  onOpenChange,
  dashboardId,
  dashboardTitle,
  redirectAfterDelete,
}: DeleteDashboardDialogProps) {
  const router = useRouter();

  function confirmDelete() {
    deleteDashboard(dashboardId);
    onOpenChange(false);
    if (redirectAfterDelete) router.push("/tail-spend");
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Delete dashboard?
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Are you sure you want to delete &quot;{dashboardTitle}&quot;? This action cannot be
                undone.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={confirmDelete}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
            >
              <Trash2 className="h-4 w-4" />
              Delete Dashboard
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
