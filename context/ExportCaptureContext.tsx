"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const IsCapturingContext = createContext(false);
const SetIsCapturingContext = createContext<(value: boolean) => void>(() => {});

/**
 * Global flag the Export Snapshot Modal flips on for the duration of a
 * capture. Every paginated detail table reads it to temporarily render all
 * of its rows instead of just the current page — see useIsExportCapturing()
 * call sites in the table components — so exported images/slides/pages never
 * show a truncated 10-row page. Mounted once in app/layout.tsx.
 */
export function ExportCaptureProvider({ children }: { children: ReactNode }) {
  const [isCapturing, setIsCapturing] = useState(false);
  return (
    <IsCapturingContext.Provider value={isCapturing}>
      <SetIsCapturingContext.Provider value={setIsCapturing}>{children}</SetIsCapturingContext.Provider>
    </IsCapturingContext.Provider>
  );
}

export function useIsExportCapturing(): boolean {
  return useContext(IsCapturingContext);
}

export function useSetExportCapturing(): (value: boolean) => void {
  return useContext(SetIsCapturingContext);
}
