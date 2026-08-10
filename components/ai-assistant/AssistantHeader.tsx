"use client";

import { Bot, Maximize2, Minimize2, SquarePen, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssistantHeaderProps {
  dashboardLabel: string;
  fullscreen: boolean;
  onNewChat: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

/** The panel's top bar — identity, dashboard context, and window controls. */
export function AssistantHeader({ dashboardLabel, fullscreen, onNewChat, onToggleFullscreen, onClose }: AssistantHeaderProps) {
  return (
    <div className={cn("shrink-0 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80", fullscreen && "sm:px-6")}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white">
          <Bot className="h-[1.125rem] w-[1.125rem]" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">AI Assistant</p>
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.65rem] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
              title="The assistant is available on this dashboard"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Available
            </span>
          </div>
          {fullscreen ? (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Ask questions about this dashboard · <span className="font-medium text-slate-600 dark:text-slate-300">Analyzing: {dashboardLabel}</span>
            </p>
          ) : (
            <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{dashboardLabel} Dashboard</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onNewChat}
            aria-label="Start a new chat"
            title="New chat"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <SquarePen className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Assistant"
            title="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
