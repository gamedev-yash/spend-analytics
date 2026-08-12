"use client";

// Export Executor Engine for the Export Snapshot Modal (components/dashboard/ExportSnapshotModal.tsx).
// Deliberately independent of lib/snapshot.ts (the plain "Export Snapshot" PNG button) and
// lib/local-snapshots.ts (the localStorage Snapshot History drawer) — this file is never imported
// by, and never imports from, either of those, so this feature can evolve without touching them.

import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";
import { DASHBOARD_PAGE_BACKGROUND } from "@/lib/snapshot";

export type ExportFormat = "png" | "pdf" | "pptx";
export type PptxLayoutMode = "single" | "multi";

export interface ExportSnapshotOptions {
  /** id of the element to capture — every dashboard page wraps its canvas in this id (see lib/snapshot.ts's DASHBOARD_CANVAS_ID). */
  targetId: string;
  format: ExportFormat;
  /** Only consulted when format === "pptx". */
  pptxLayout: PptxLayoutMode;
  dashboardTitle: string;
  includeFilterSummary: boolean;
  includeTimestampFooter: boolean;
  /** Human-readable active-filters line, e.g. "BU: Plant A · Category: Raw Materials". Empty/omitted renders as "No filters applied". */
  activeFiltersSummary?: string;
  /** Only used when includeTimestampFooter is true. */
  userName?: string;
  isDark: boolean;
  onProgress?: (status: string) => void;
}

/**
 * Elements to hide (via visibility, not display, so layout never shifts)
 * while capturing. The floating AI Assistant launcher and any lingering
 * Recharts tooltip are the only ones that can realistically ever be
 * descendants of #dashboard-canvas — the filter drawer and nav sidebar are
 * siblings outside the capture target and would never appear regardless,
 * but hiding them too costs nothing and matches the brief literally.
 */
const FLOATING_UI_SELECTORS = [
  "#ai-assistant-button",
  '[aria-label="AI Assistant"]',
  ".recharts-tooltip-wrapper",
  '[data-slot="sheet-content"]',
];

async function withHiddenFloatingUi<T>(run: () => Promise<T>): Promise<T> {
  const restores: Array<() => void> = [];
  for (const selector of FLOATING_UI_SELECTORS) {
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      const previous = el.style.visibility;
      el.style.visibility = "hidden";
      restores.push(() => {
        el.style.visibility = previous;
      });
    });
  }
  try {
    return await run();
  } finally {
    restores.forEach((restore) => restore());
  }
}

function getCanvasNode(targetId: string): HTMLElement {
  const node = document.getElementById(targetId);
  if (!node) {
    throw new Error(`Could not find "#${targetId}" on this page to capture.`);
  }
  return node;
}

function pageBackground(isDark: boolean): string {
  return isDark ? DASHBOARD_PAGE_BACKGROUND.dark : DASHBOARD_PAGE_BACKGROUND.light;
}

async function captureNodeAsPngDataUrl(node: HTMLElement, isDark: boolean): Promise<string> {
  return toPng(node, {
    pixelRatio: 2,
    backgroundColor: pageBackground(isDark),
    cacheBust: true,
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read a captured image."));
    img.src = dataUrl;
  });
}

function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return slug || "dashboard";
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function formatTimestamp(): string {
  return new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function filtersLine(options: ExportSnapshotOptions): string {
  return options.activeFiltersSummary?.trim() ? options.activeFiltersSummary : "No filters applied";
}

function footerLine(options: ExportSnapshotOptions): string {
  const who = options.userName?.trim();
  return who ? `Exported by ${who} · ${formatTimestamp()}` : `Exported ${formatTimestamp()}`;
}

// ---------------------------------------------------------------------------
// PNG — captures #dashboard-canvas, then (if any metadata option is on)
// composites a header/footer band around it on an offscreen canvas so the
// checkboxes have real effect on every format, not just PPTX.
// ---------------------------------------------------------------------------

const HEADER_NAVY = "#0f172a"; // slate-900
const HEADER_TEXT = "#f8fafc"; // slate-50

async function withMetadataBand(dataUrl: string, options: ExportSnapshotOptions): Promise<string> {
  if (!options.includeFilterSummary && !options.includeTimestampFooter) return dataUrl;

  const img = await loadImage(dataUrl);
  const width = img.naturalWidth;
  const bandHeight = Math.round(Math.min(Math.max(width * 0.045, 64), 140));
  const hasFooter = options.includeTimestampFooter;
  const footerHeight = hasFooter ? Math.round(bandHeight * 0.6) : 0;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = img.naturalHeight + bandHeight + footerHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.fillStyle = pageBackground(options.isDark);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header band
  ctx.fillStyle = HEADER_NAVY;
  ctx.fillRect(0, 0, width, bandHeight);
  ctx.fillStyle = HEADER_TEXT;
  ctx.textBaseline = "middle";
  const titleSize = Math.round(bandHeight * 0.32);
  ctx.font = `700 ${titleSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const titleY = options.includeFilterSummary ? bandHeight * 0.38 : bandHeight * 0.5;
  ctx.fillText(`Dashboard Snapshot — ${options.dashboardTitle}`, width * 0.025, titleY);
  if (options.includeFilterSummary) {
    const subSize = Math.round(bandHeight * 0.2);
    ctx.font = `500 ${subSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.globalAlpha = 0.8;
    ctx.fillText(filtersLine(options), width * 0.025, bandHeight * 0.72);
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(img, 0, bandHeight);

  if (hasFooter) {
    ctx.fillStyle = options.isDark ? "#1e293b" : "#e2e8f0"; // slate-800 / slate-200
    ctx.fillRect(0, bandHeight + img.naturalHeight, width, footerHeight);
    ctx.fillStyle = options.isDark ? "#cbd5e1" : "#475569"; // slate-300 / slate-600
    const footSize = Math.round(footerHeight * 0.42);
    ctx.font = `500 ${footSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(footerLine(options), width * 0.025, bandHeight + img.naturalHeight + footerHeight / 2);
  }

  return canvas.toDataURL("image/png");
}

async function exportAsPng(options: ExportSnapshotOptions): Promise<void> {
  options.onProgress?.("Capturing elements...");
  const raw = await withHiddenFloatingUi(() => captureNodeAsPngDataUrl(getCanvasNode(options.targetId), options.isDark));
  options.onProgress?.("Preparing download...");
  const finalDataUrl = await withMetadataBand(raw, options);
  downloadDataUrl(finalDataUrl, `${slugify(options.dashboardTitle)}-snapshot-${Date.now()}.png`);
}

// ---------------------------------------------------------------------------
// PDF — one landscape page, image fit-to-page with native text header/footer.
// ---------------------------------------------------------------------------

async function exportAsPdf(options: ExportSnapshotOptions): Promise<void> {
  options.onProgress?.("Capturing elements...");
  const dataUrl = await withHiddenFloatingUi(() => captureNodeAsPngDataUrl(getCanvasNode(options.targetId), options.isDark));
  const img = await loadImage(dataUrl);

  options.onProgress?.("Preparing download...");
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;

  let contentTop = margin;
  let contentBottom = pageHeight - margin;

  if (options.includeFilterSummary) {
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42); // slate-900
    pdf.text(`Dashboard Snapshot — ${options.dashboardTitle}`, margin, contentTop + 12);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139); // slate-500
    pdf.text(filtersLine(options), margin, contentTop + 28);
    contentTop += 40;
  }

  if (options.includeTimestampFooter) {
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text(footerLine(options), margin, pageHeight - 12);
    contentBottom -= 16;
  }

  const maxW = pageWidth - margin * 2;
  const maxH = contentBottom - contentTop;
  const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const x = (pageWidth - drawW) / 2;
  const y = contentTop + (maxH - drawH) / 2;
  pdf.addImage(dataUrl, "PNG", x, y, drawW, drawH);
  pdf.save(`${slugify(options.dashboardTitle)}-snapshot-${Date.now()}.pdf`);
}

// ---------------------------------------------------------------------------
// PPTX — 16:9 widescreen. Single slide (whole dashboard) or 4-section deck.
// ---------------------------------------------------------------------------

const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
const HEADER_H = 0.7;
const FOOTER_H = 0.3;
const MARGIN_X = 0.4;

function addHeaderAndFooter(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  title: string,
  subtitle: string,
  options: ExportSnapshotOptions
): { contentTop: number; contentHeight: number } {
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: HEADER_H, fill: { color: "0F172A" } });
  slide.addText(title, {
    x: MARGIN_X,
    y: 0,
    w: SLIDE_W - MARGIN_X * 2,
    h: HEADER_H,
    fontSize: 20,
    bold: true,
    color: "F8FAFC",
    valign: "middle",
    fontFace: "Arial",
  });
  slide.addText(subtitle, {
    x: 0,
    y: 0,
    w: SLIDE_W - MARGIN_X,
    h: HEADER_H,
    fontSize: 12,
    color: "94A3B8",
    align: "right",
    valign: "middle",
    fontFace: "Arial",
  });

  let contentTop = HEADER_H + 0.15;
  if (options.includeFilterSummary) {
    slide.addText(filtersLine(options), {
      x: MARGIN_X,
      y: HEADER_H + 0.05,
      w: SLIDE_W - MARGIN_X * 2,
      h: 0.3,
      fontSize: 11,
      italic: true,
      color: "64748B",
      fontFace: "Arial",
    });
    contentTop += 0.3;
  }

  let contentHeight = SLIDE_H - contentTop - 0.15;
  if (options.includeTimestampFooter) {
    contentHeight -= FOOTER_H;
    slide.addText(footerLine(options), {
      x: MARGIN_X,
      y: SLIDE_H - FOOTER_H - 0.05,
      w: SLIDE_W - MARGIN_X * 2,
      h: FOOTER_H,
      fontSize: 9,
      color: "94A3B8",
      align: "right",
      fontFace: "Arial",
    });
  }

  return { contentTop, contentHeight };
}

function placeImageFitted(
  slide: PptxGenJS.Slide,
  dataUrl: string,
  img: HTMLImageElement,
  contentTop: number,
  contentHeight: number
): void {
  const maxW = SLIDE_W - MARGIN_X * 2;
  const maxH = contentHeight;
  const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const x = (SLIDE_W - w) / 2;
  const y = contentTop + (maxH - h) / 2;
  slide.addImage({ data: dataUrl, x, y, w, h });
}

async function captureElementAsPngDataUrl(node: HTMLElement, isDark: boolean): Promise<string> {
  return toPng(node, { pixelRatio: 2, backgroundColor: pageBackground(isDark), cacheBust: true });
}

interface SectionSlideSpec {
  subtitle: string;
  find: (canvas: HTMLElement) => HTMLElement | null;
}

const MULTI_SLIDE_SECTIONS: SectionSlideSpec[] = [
  { subtitle: "KPI Overview", find: (canvas) => canvas.querySelector<HTMLElement>(".kpi-ribbon") },
  { subtitle: "Primary Breakdown", find: (canvas) => canvas.querySelector<HTMLElement>("#primary-charts") },
  { subtitle: "Secondary Trends", find: (canvas) => canvas.querySelector<HTMLElement>("#secondary-charts") },
  { subtitle: "Detail Report", find: (canvas) => canvas.querySelector<HTMLElement>("table")?.closest("div") ?? canvas.querySelector<HTMLElement>("table") },
];

async function exportAsPptxSingle(pptx: PptxGenJS, options: ExportSnapshotOptions): Promise<void> {
  options.onProgress?.("Capturing elements...");
  const dataUrl = await withHiddenFloatingUi(() => captureNodeAsPngDataUrl(getCanvasNode(options.targetId), options.isDark));
  const img = await loadImage(dataUrl);

  options.onProgress?.("Building PowerPoint deck...");
  const slide = pptx.addSlide();
  const { contentTop, contentHeight } = addHeaderAndFooter(
    pptx,
    slide,
    `Dashboard Snapshot — ${options.dashboardTitle}`,
    "Overview",
    options
  );
  placeImageFitted(slide, dataUrl, img, contentTop, contentHeight);
}

async function exportAsPptxMulti(pptx: PptxGenJS, options: ExportSnapshotOptions): Promise<void> {
  const canvas = getCanvasNode(options.targetId);
  let capturedAny = false;

  await withHiddenFloatingUi(async () => {
    for (const section of MULTI_SLIDE_SECTIONS) {
      const node = section.find(canvas);
      if (!node) continue; // dashboard doesn't have this section — skip its slide rather than error

      options.onProgress?.(`Capturing ${section.subtitle.toLowerCase()}...`);
      const dataUrl = await captureElementAsPngDataUrl(node, options.isDark);
      const img = await loadImage(dataUrl);

      options.onProgress?.("Building PowerPoint deck...");
      const slide = pptx.addSlide();
      const { contentTop, contentHeight } = addHeaderAndFooter(
        pptx,
        slide,
        `Dashboard Snapshot — ${options.dashboardTitle}`,
        section.subtitle,
        options
      );
      placeImageFitted(slide, dataUrl, img, contentTop, contentHeight);
      capturedAny = true;
    }
  });

  if (!capturedAny) {
    throw new Error("Could not find any sections to export on this dashboard.");
  }
}

async function exportAsPptx(options: ExportSnapshotOptions): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "SNAPSHOT_WIDESCREEN", width: SLIDE_W, height: SLIDE_H });
  pptx.layout = "SNAPSHOT_WIDESCREEN";

  if (options.pptxLayout === "single") {
    await exportAsPptxSingle(pptx, options);
  } else {
    await exportAsPptxMulti(pptx, options);
  }

  options.onProgress?.("Preparing download...");
  await pptx.writeFile({ fileName: `${slugify(options.dashboardTitle)}-snapshot-${Date.now()}.pptx` });
}

// ---------------------------------------------------------------------------

export async function runDashboardExport(options: ExportSnapshotOptions): Promise<void> {
  if (options.format === "png") return exportAsPng(options);
  if (options.format === "pdf") return exportAsPdf(options);
  return exportAsPptx(options);
}
