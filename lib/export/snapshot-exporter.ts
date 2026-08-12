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
export type PdfLayoutMode = "widget-per-page" | "continuous";

export interface ExportSnapshotOptions {
  /** id of the element to capture — every dashboard page wraps its canvas in this id (see lib/snapshot.ts's DASHBOARD_CANVAS_ID). */
  targetId: string;
  format: ExportFormat;
  /** Only consulted when format === "pptx". */
  pptxLayout: PptxLayoutMode;
  /** Only consulted when format === "pdf". */
  pdfLayout: PdfLayoutMode;
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

// ---------------------------------------------------------------------------
// Capture environment — hide floating UI/scrollbars, and temporarily let any
// internally-scrolling container (a wide table's horizontal scroller, etc.)
// render at its full natural size instead of the clipped, scrolled viewport
// html-to-image would otherwise capture.
// ---------------------------------------------------------------------------

const FLOATING_UI_SELECTORS = [
  "#ai-assistant-button",
  '[aria-label="AI Assistant"]',
  ".recharts-tooltip-wrapper",
  '[data-slot="sheet-content"]',
];

function hideFloatingUi(): () => void {
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
  return () => restores.forEach((restore) => restore());
}

function hideScrollbarsGlobally(): () => void {
  const style = document.createElement("style");
  style.textContent =
    "*{scrollbar-width:none !important;}*::-webkit-scrollbar{display:none !important;width:0 !important;height:0 !important;}";
  document.head.appendChild(style);
  return () => style.remove();
}

/** Elements whose own overflow would otherwise clip captured content (a wide table's horizontal scroller, a capped list). Temporarily let them render at full size. */
function expandOverflowContainers(root: HTMLElement): () => void {
  const restores: Array<() => void> = [];
  const candidates: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of candidates) {
    const computed = getComputedStyle(el);
    if (
      computed.overflowX === "auto" ||
      computed.overflowX === "scroll" ||
      computed.overflowY === "auto" ||
      computed.overflowY === "scroll"
    ) {
      const previous = { overflow: el.style.overflow, x: el.style.overflowX, y: el.style.overflowY };
      el.style.overflow = "visible";
      el.style.overflowX = "visible";
      el.style.overflowY = "visible";
      restores.push(() => {
        el.style.overflow = previous.overflow;
        el.style.overflowX = previous.x;
        el.style.overflowY = previous.y;
      });
    }
  }
  return () => restores.forEach((restore) => restore());
}

/** Full before/after wrapper for a single whole-node capture (PNG, single-slide PPTX, continuous PDF). */
async function withCapturePrep<T>(root: HTMLElement, run: () => Promise<T>): Promise<T> {
  const restoreFloating = hideFloatingUi();
  const restoreScrollbars = hideScrollbarsGlobally();
  const restoreOverflow = expandOverflowContainers(root);
  try {
    return await run();
  } finally {
    restoreOverflow();
    restoreScrollbars();
    restoreFloating();
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
  const canvasNode = getCanvasNode(options.targetId);
  const raw = await withCapturePrep(canvasNode, () => captureNodeAsPngDataUrl(canvasNode, options.isDark));
  options.onProgress?.("Preparing download...");
  const finalDataUrl = await withMetadataBand(raw, options);
  downloadDataUrl(finalDataUrl, `${slugify(options.dashboardTitle)}-snapshot-${Date.now()}.png`);
}

// ---------------------------------------------------------------------------
// Granular widget discovery — every individual chart/table/KPI-ribbon inside
// the dashboard canvas, captured and placed one-per-slide (PPTX multi) or
// packed onto pages (PDF widget-per-page) instead of a handful of bulk
// section wrappers.
// ---------------------------------------------------------------------------

const WIDGET_SELECTOR = ".chart-card, [data-export-widget], .kpi-ribbon, table";

interface CapturedWidget {
  title: string;
  el: HTMLElement;
}

function extractWidgetTitle(el: HTMLElement, fallbackIndex: number): string {
  if (el.classList.contains("kpi-ribbon")) return "Executive KPI Overview";
  const explicit = el.getAttribute("data-export-title");
  if (explicit?.trim()) return explicit.trim();
  const heading = el.querySelector("h1, h2, h3, h4, [data-export-title]");
  if (heading?.textContent?.trim()) return heading.textContent.trim();
  return `Widget ${fallbackIndex}`;
}

/**
 * Every chart card, tagged widget, KPI ribbon, and bare table inside the
 * dashboard canvas, deduplicated to its outermost meaningful container (a
 * `<table>` nested inside a `.chart-card` counts once, at the card) and with
 * the KPI ribbon always sorted first regardless of its DOM position.
 */
function getWidgetElements(canvas: HTMLElement): CapturedWidget[] {
  const matches = Array.from(canvas.querySelectorAll<HTMLElement>(WIDGET_SELECTOR));
  const kept: HTMLElement[] = [];

  for (const el of matches) {
    if (kept.some((k) => k !== el && k.contains(el))) continue; // already covered by a kept ancestor
    for (let i = kept.length - 1; i >= 0; i--) {
      if (el !== kept[i] && el.contains(kept[i])) kept.splice(i, 1); // this new match supersedes an earlier, nested one
    }
    kept.push(el);
  }

  kept.sort((a, b) => Number(!a.classList.contains("kpi-ribbon")) - Number(!b.classList.contains("kpi-ribbon")));

  return kept.map((el, index) => ({ el, title: extractWidgetTitle(el, index + 1) }));
}

interface CapturedWidgetImage {
  title: string;
  dataUrl: string;
  img: HTMLImageElement;
}

async function captureAllWidgets(
  canvas: HTMLElement,
  isDark: boolean,
  onProgress?: (status: string) => void
): Promise<CapturedWidgetImage[]> {
  const widgets = getWidgetElements(canvas);
  if (widgets.length === 0) {
    throw new Error("Could not find any chart, table, or KPI widgets to export on this dashboard.");
  }

  const restoreFloating = hideFloatingUi();
  const restoreScrollbars = hideScrollbarsGlobally();
  try {
    const results: CapturedWidgetImage[] = [];
    for (const widget of widgets) {
      onProgress?.(`Capturing ${widget.title}...`);
      const restoreOverflow = expandOverflowContainers(widget.el);
      try {
        const dataUrl = await captureNodeAsPngDataUrl(widget.el, isDark);
        const img = await loadImage(dataUrl);
        results.push({ title: widget.title, dataUrl, img });
      } finally {
        restoreOverflow();
      }
    }
    return results;
  } finally {
    restoreScrollbars();
    restoreFloating();
  }
}

// ---------------------------------------------------------------------------
// PDF — landscape A4. Two layouts: one widget per page (packing a second one
// on if it fits), or a single continuous capture sliced across as many pages
// as it takes, at one uniform fit-width scale so nothing ever stretches.
// ---------------------------------------------------------------------------

const PDF_MARGIN = 24; // pt
const PDF_TITLE_H = 16;
const PDF_GAP = 14;

function pdfPageMetrics(pdf: jsPDF): { pageWidth: number; pageHeight: number } {
  return { pageWidth: pdf.internal.pageSize.getWidth(), pageHeight: pdf.internal.pageSize.getHeight() };
}

function computePdfContentMetrics(options: ExportSnapshotOptions, pageHeight: number): { contentTop: number; contentBottom: number } {
  let contentTop = PDF_MARGIN;
  let contentBottom = pageHeight - PDF_MARGIN;
  if (options.includeFilterSummary) contentTop += 40;
  if (options.includeTimestampFooter) contentBottom -= 16;
  return { contentTop, contentBottom };
}

/** Draws header/footer/page-label chrome on the PDF's CURRENT page (see jsPDF's setPage). Never touches the content area between contentTop/contentBottom. */
function drawPdfPageChrome(pdf: jsPDF, options: ExportSnapshotOptions, pageWidth: number, pageHeight: number, pageLabel: string): void {
  if (options.includeFilterSummary) {
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42); // slate-900
    pdf.text(`Dashboard Snapshot — ${options.dashboardTitle}`, PDF_MARGIN, PDF_MARGIN + 12);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139); // slate-500
    pdf.text(filtersLine(options), PDF_MARGIN, PDF_MARGIN + 28);
  }
  if (options.includeTimestampFooter) {
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text(footerLine(options), PDF_MARGIN, pageHeight - 12);
  }
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(148, 163, 184); // slate-400
  pdf.text(pageLabel, pageWidth - PDF_MARGIN, pageHeight - 12, { align: "right" });
}

/** "Continuous Paginated PDF" — one capture, fit to page width at a single uniform scale, sliced vertically across as many pages as that scaled height needs. Never distorts because every page shares the same scale factor. */
async function exportAsPdfContinuous(pdf: jsPDF, options: ExportSnapshotOptions): Promise<void> {
  options.onProgress?.("Capturing elements...");
  const canvasNode = getCanvasNode(options.targetId);
  const dataUrl = await withCapturePrep(canvasNode, () => captureNodeAsPngDataUrl(canvasNode, options.isDark));
  const img = await loadImage(dataUrl);

  const { pageWidth, pageHeight } = pdfPageMetrics(pdf);
  const { contentTop, contentBottom } = computePdfContentMetrics(options, pageHeight);
  const maxW = pageWidth - PDF_MARGIN * 2;
  const pageContentHeight = contentBottom - contentTop;
  const scale = maxW / img.naturalWidth;
  const scaledFullHeight = img.naturalHeight * scale;
  const pageCount = Math.max(1, Math.ceil(scaledFullHeight / pageContentHeight));

  const sliceCanvas = document.createElement("canvas");
  sliceCanvas.width = Math.max(1, Math.round(img.naturalWidth));
  const sliceCtx = sliceCanvas.getContext("2d");
  if (!sliceCtx) throw new Error("Could not prepare this page for the PDF.");

  for (let page = 0; page < pageCount; page++) {
    if (page > 0) pdf.addPage();

    const sourceTop = (page * pageContentHeight) / scale;
    const sourceHeight = Math.min(pageContentHeight / scale, img.naturalHeight - sourceTop);
    const destHeight = sourceHeight * scale;

    sliceCanvas.height = Math.max(1, Math.round(sourceHeight));
    sliceCtx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    sliceCtx.drawImage(img, 0, sourceTop, img.naturalWidth, sourceHeight, 0, 0, sliceCanvas.width, sliceCanvas.height);
    pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", PDF_MARGIN, contentTop, maxW, destHeight);
  }

  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    drawPdfPageChrome(pdf, options, pageWidth, pageHeight, `Page ${page} of ${pageCount}`);
  }
}

/** "Multi-Page Executive PDF" — every widget captured individually and fit to page width, packing a second (or third, for small KPI cards) widget onto the same page whenever it fits, but never splitting one widget across two pages. */
async function exportAsPdfWidgetPerPage(pdf: jsPDF, options: ExportSnapshotOptions): Promise<void> {
  const canvas = getCanvasNode(options.targetId);
  const widgets = await captureAllWidgets(canvas, options.isDark, options.onProgress);

  const { pageWidth, pageHeight } = pdfPageMetrics(pdf);
  const { contentTop, contentBottom } = computePdfContentMetrics(options, pageHeight);
  const maxW = pageWidth - PDF_MARGIN * 2;
  const availableH = contentBottom - contentTop;

  let pageCount = 1;
  let cursorY = contentTop;

  for (const widget of widgets) {
    let scale = maxW / widget.img.naturalWidth;
    let renderH = widget.img.naturalHeight * scale;
    if (renderH > availableH - PDF_TITLE_H) {
      // Too tall even alone at fit-width scale — contain-fit against a full page instead of overflowing it.
      scale = Math.min(scale, (availableH - PDF_TITLE_H) / widget.img.naturalHeight);
      renderH = widget.img.naturalHeight * scale;
    }
    const renderW = widget.img.naturalWidth * scale;
    const neededH = PDF_TITLE_H + renderH;

    if (cursorY + neededH > contentBottom && cursorY > contentTop) {
      pdf.addPage();
      pageCount += 1;
      cursorY = contentTop;
    }

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42); // slate-900
    pdf.text(widget.title, PDF_MARGIN, cursorY + 10);

    const x = PDF_MARGIN + (maxW - renderW) / 2;
    pdf.addImage(widget.dataUrl, "PNG", x, cursorY + PDF_TITLE_H, renderW, renderH);
    cursorY += neededH + PDF_GAP;
  }

  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    drawPdfPageChrome(pdf, options, pageWidth, pageHeight, `Page ${page} of ${pageCount}`);
  }
}

async function exportAsPdf(options: ExportSnapshotOptions): Promise<void> {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  if (options.pdfLayout === "widget-per-page") {
    await exportAsPdfWidgetPerPage(pdf, options);
  } else {
    await exportAsPdfContinuous(pdf, options);
  }

  options.onProgress?.("Preparing download...");
  pdf.save(`${slugify(options.dashboardTitle)}-snapshot-${Date.now()}.pdf`);
}

// ---------------------------------------------------------------------------
// PPTX — 16:9 widescreen. Single slide (whole dashboard, contain-scaled) or
// one dedicated slide per widget (KPI ribbon first, then every chart/table).
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

/** Contain-fits (never crops or stretches) the image into the slide's content area, centered on both axes. */
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

async function exportAsPptxSingle(pptx: PptxGenJS, options: ExportSnapshotOptions): Promise<void> {
  options.onProgress?.("Capturing elements...");
  const canvasNode = getCanvasNode(options.targetId);
  const dataUrl = await withCapturePrep(canvasNode, () => captureNodeAsPngDataUrl(canvasNode, options.isDark));
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
  const widgets = await captureAllWidgets(canvas, options.isDark, options.onProgress);

  options.onProgress?.("Building PowerPoint deck...");
  for (const widget of widgets) {
    const slide = pptx.addSlide();
    const { contentTop, contentHeight } = addHeaderAndFooter(
      pptx,
      slide,
      `Dashboard Snapshot — ${options.dashboardTitle}`,
      widget.title,
      options
    );
    placeImageFitted(slide, widget.dataUrl, widget.img, contentTop, contentHeight);
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
