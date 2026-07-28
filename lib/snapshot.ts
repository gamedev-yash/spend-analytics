"use client";

import { toPng } from "html-to-image";

/** Canonical id every dashboard page's widget-canvas wrapper carries — the capture target for ExportSnapshotButton. */
export const DASHBOARD_CANVAS_ID = "dashboard-canvas";

export interface SnapshotOptions {
  /** Flat page background painted behind transparent regions — pass the resolved theme's page bg (slate-50 light / slate-950 dark). */
  backgroundColor?: string;
  /** Device pixel ratio baked into the PNG — 2 gives a retina-quality export. */
  pixelRatio?: number;
}

const DEFAULT_PIXEL_RATIO = 2;
const DEFAULT_BACKGROUND = "#f8fafc"; // slate-50

/** "Tail Spend Analysis!" -> "tail-spend-analysis"; empty/symbol-only titles fall back to "dashboard". */
function slugifyForFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return slug || "dashboard";
}

/**
 * Capture the DOM subtree rooted at `elementId` as a high-resolution PNG and
 * trigger a browser download. Every dashboard page wraps its full widget
 * canvas in an element with this id (`#dashboard-canvas`), so the export
 * always captures the whole visible dashboard rather than one widget.
 */
export async function exportDashboardSnapshot(
  elementId: string,
  dashboardTitle: string,
  options: SnapshotOptions = {}
): Promise<void> {
  const node = document.getElementById(elementId);
  if (!node) {
    throw new Error(`Could not find "#${elementId}" on this page to capture.`);
  }

  const dataUrl = await toPng(node, {
    pixelRatio: options.pixelRatio ?? DEFAULT_PIXEL_RATIO,
    backgroundColor: options.backgroundColor ?? DEFAULT_BACKGROUND,
    cacheBust: true,
  });

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${slugifyForFilename(dashboardTitle)}-snapshot-${Date.now()}.png`;
  link.click();
}
