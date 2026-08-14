"use client";

import { Bot, ExternalLink, Maximize2, Minimize2, MessageCircleX, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssistantHeaderProps {
  dashboardLabel: string;
  fullscreen: boolean;
  onNewChat: () => void;
  /** Omitted on the standalone /assistant page — it's always full-viewport there, so there's nothing to toggle. */
  onToggleFullscreen?: () => void;
  /** Collapses the panel back to the launcher bubble — conversation state (messages, input, report mode) is preserved, not cleared; see DashboardAssistant.tsx. Omitted on the standalone page (no launcher bubble to minimize back to). */
  onMinimize?: () => void;
  /** Omitted on the standalone /assistant page (already its own tab) — the button is hidden rather than shown-and-broken. */
  onOpenInNewTab?: () => void;
}

/** The panel's top bar — identity, dashboard context, and window controls. Report Mode lives entirely in Composer.tsx's toolbar now (a Gemini-style inline pill next to Send) — this header never renders it. */
export function AssistantHeader({
  dashboardLabel,
  fullscreen,
  onNewChat,
  onToggleFullscreen,
  onMinimize,
  onOpenInNewTab,
}: AssistantHeaderProps) {
  return (
    <div className={cn("shrink-0 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80", fullscreen && "sm:px-6")}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          <Bot className="h-[1.125rem] w-[1.125rem]" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">AI Assistant</p>
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-emerald-600 dark:text-emerald-400"
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

        {/* Every control lives in this one top-right cluster: Clear Chat, then
            the window controls in a fixed order (Minimize, Full Screen, Open
            in New Tab) — each hidden individually when its handler is omitted
            (see the standalone-page doc comments above). */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onNewChat}
            aria-label="Clear conversation"
            title="Clear Chat"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <MessageCircleX className="h-4 w-4" />
          </button>
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimize"
              title="Minimize"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <Minus className="h-4 w-4" />
            </button>
          )}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
          {onOpenInNewTab && (
            <button
              type="button"
              onClick={onOpenInNewTab}
              aria-label="Open in new tab"
              title="Open in new tab"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
