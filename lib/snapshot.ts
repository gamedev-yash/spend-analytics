"use client";

import { toJpeg, toPng } from "html-to-image";

/** Canonical id every dashboard page's widget-canvas wrapper carries — the capture target for ExportSnapshotButton and the Snapshot History drawer. */
export const DASHBOARD_CANVAS_ID = "dashboard-canvas";

export interface SnapshotOptions {
  /** Flat page background painted behind transparent regions — pass the resolved theme's page bg (slate-50 light / slate-950 dark). */
  backgroundColor?: string;
  /** Device pixel ratio baked into the PNG — 2 gives a retina-quality export. */
  pixelRatio?: number;
}

const DEFAULT_PIXEL_RATIO = 2;
const DEFAULT_BACKGROUND = "#f8fafc"; // slate-50

/** Matches DashboardShell's page background (`bg-slate-50 dark:bg-slate-950`) — shared by every capture entry point in this file so light/dark exports never drift apart. */
export const DASHBOARD_PAGE_BACKGROUND = { light: DEFAULT_BACKGROUND, dark: "#020617" } as const;

/** "Tail Spend Analysis!" -> "tail-spend-analysis"; empty/symbol-only titles fall back to "dashboard". */
function slugifyForFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return slug || "dashboard";
}

function getCanvasNode(elementId: string): HTMLElement {
  const node = document.getElementById(elementId);
  if (!node) {
    throw new Error(`Could not find "#${elementId}" on this page to capture.`);
  }
  return node;
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
  const dataUrl = await toPng(getCanvasNode(elementId), {
    pixelRatio: options.pixelRatio ?? DEFAULT_PIXEL_RATIO,
    backgroundColor: options.backgroundColor ?? DEFAULT_BACKGROUND,
    cacheBust: true,
  });

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${slugifyForFilename(dashboardTitle)}-snapshot-${Date.now()}.png`;
  link.click();
}

export interface CaptureImageOptions {
  backgroundColor?: string;
  /** 0-1. Lower than exportDashboardSnapshot's PNG default, since these images live in localStorage rather than a one-off download. */
  quality?: number;
  pixelRatio?: number;
}

const HISTORY_JPEG_QUALITY = 0.7;
const HISTORY_PIXEL_RATIO = 1;

/**
 * Capture `#dashboard-canvas` as a compressed JPEG data URL for the in-app
 * Snapshot History drawer (lib/local-snapshots.ts) — never triggers a
 * download. Deliberately lower pixel ratio + JPEG compression than
 * exportDashboardSnapshot's PNG: a handful of these need to comfortably fit
 * inside localStorage's ~5MB quota alongside everything else the app stores
 * there, where exportDashboardSnapshot's one-off download has no such limit.
 */
export async function captureDashboardImage(elementId: string, options: CaptureImageOptions = {}): Promise<string> {
  return toJpeg(getCanvasNode(elementId), {
    pixelRatio: options.pixelRatio ?? HISTORY_PIXEL_RATIO,
    backgroundColor: options.backgroundColor ?? DEFAULT_BACKGROUND,
    quality: options.quality ?? HISTORY_JPEG_QUALITY,
    cacheBust: true,
  });
}
