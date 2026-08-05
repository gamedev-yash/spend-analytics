"use client";

import { createContext, useContext, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ResponsiveContainer } from "recharts";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const FullscreenChartContext = createContext(false);

/**
 * True when the calling chart is rendering inside a FullscreenOverlay.
 *
 * Most charts already use `<ResponsiveContainer height="100%">` and stretch
 * to fill the overlay for free (its parent chain is a definite-height flex
 * column — see app/globals.css's `[data-fullscreen-chart]` rules). A chart
 * that instead hardcodes a fixed pixel height (the right default for a
 * compact card) needs this flag to switch that one number to `"100%"` when
 * fullscreen — Recharts uses a numeric height prop literally and never
 * measures its container for that axis, so no CSS override can do this
 * from outside; the height prop itself has to change.
 *
 * IMPORTANT — where you call this matters. ChartCard/FullscreenOverlay mount
 * a single `children` prop TWICE (once inline, once inside the overlay).
 * Calling this hook in the same top-level component that also calls
 * `<ChartCard>` bakes its result into a plain prop value once, before either
 * copy mounts — both copies end up with whatever value was current at that
 * one render, which is always `false`. It only reads correctly when called
 * inside a component that is itself part of the duplicated `children` tree
 * (a standalone chart component passed in as children, or a wrapper like
 * `FullscreenResponsiveContainer` below) — React defers invoking that
 * component's body until each of the two copies actually mounts, so each
 * call site sees its own position's real context value.
 */
export function useIsFullscreenChart(): boolean {
  return useContext(FullscreenChartContext);
}

/**
 * Drop-in replacement for `<ResponsiveContainer width="100%" height={N}>` in
 * chart files that read `useIsFullscreenChart()` in the same component that
 * calls `<ChartCard>` — see the note on `useIsFullscreenChart` above for why
 * that pattern silently fails to stretch in the overlay. Wrapping the switch
 * in its own component fixes it: this one is nested inside ChartCard's
 * `children`, so it re-renders fresh for both the inline and overlay copies.
 */
export function FullscreenResponsiveContainer({ height, children }: { height: number; children: ReactElement }) {
  const isFullscreen = useIsFullscreenChart();
  return (
    <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : height}>
      {children}
    </ResponsiveContainer>
  );
}

/** Open/close state for a widget's fullscreen overlay, plus the Esc-to-close wiring. */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsFullscreen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  return { isFullscreen, setIsFullscreen };
}

/** The header icon button every widget uses to enter fullscreen — a consistent target size/style everywhere it appears. */
export function MaximizeButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Expand to fullscreen"
      aria-label="Expand to fullscreen"
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700/60 dark:hover:text-slate-200",
        className
      )}
    >
      <Maximize2 className="h-4 w-4" />
    </button>
  );
}

interface FullscreenOverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** A short, human-readable summary of the filters currently narrowing this widget's data, if the page can cheaply compute one. */
  activeFilters?: string;
  children: ReactNode;
}

/**
 * A dependency-free fullscreen widget dialog — an inset fixed overlay rather
 * than a Radix/shadcn Dialog, since no Dialog primitive exists in this repo
 * yet and this doesn't warrant adding one. Portaled to `document.body` so it
 * escapes any `overflow-hidden`/`transform` ancestor (every ChartCard is
 * exactly that). Renders a second, independent copy of `children` — cheap
 * for this app's chart sizes, and avoids fighting the inline card for the
 * same mounted instance.
 */
export function FullscreenOverlay({ open, onClose, title, description, activeFilters, children }: FullscreenOverlayProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex h-[85vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-slate-100/50 px-5 py-4 dark:border-slate-800/80 dark:bg-slate-900/90">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{title}</p>
            {description && <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{description}</p>}
            {activeFilters && (
              <p className="mt-1.5 truncate text-xs text-slate-400 dark:text-slate-500">
                <span className="font-medium text-slate-500 dark:text-slate-400">Filters: </span>
                {activeFilters}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close fullscreen"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {/* data-fullscreen-chart: see app/globals.css — forces every
              Recharts ResponsiveContainer inside here to actually fill this
              enlarged space instead of keeping its card-sized fixed height. */}
          <div className="h-full min-h-[400px]" data-fullscreen-chart>
            <FullscreenChartContext.Provider value={true}>{children}</FullscreenChartContext.Provider>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
