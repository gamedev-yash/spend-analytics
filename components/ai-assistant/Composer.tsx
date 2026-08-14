"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Send, Square } from "lucide-react";
import { ReportModeToggle } from "./ReportModeToggle";
import { cn } from "@/lib/utils";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  placeholder: string;
  fullscreen: boolean;
  /**
   * Report mode — a sticky per-conversation mode toggled here, not a per-answer
   * button. While on, the next thing the user sends runs the action-plan
   * workflow instead of a normal chat turn; while off, nothing about the chat
   * path changes at all. Conceptually the same shape as ChatGPT's Deep
   * Research toggle: the user declares intent BEFORE typing, and the mode is
   * the only thing that decides which pipeline runs.
   *
   * Rendered inline in THIS row — a Gemini-style compact pill directly left
   * of Send, in both popover and fullscreen — never in the header (see
   * AssistantHeader, which no longer knows about Report Mode at all).
   */
  reportMode: boolean;
  onToggleReportMode: () => void;
  /** Label from the action registry (lib/ai/actions/assistant-actions.ts) — never hardcoded here, so a renamed or added action needs no change in this file. */
  reportModeLabel: string;
  /** Measured expectation from the same registry entry. Surfaced because enabling this commits the user to minutes, not seconds. */
  reportModeSeconds: number;
  /** False when the current dashboard offers no report action — the toggle is then hidden rather than shown-and-broken. */
  reportModeAvailable: boolean;
  /** True when there is no data behind this dashboard to answer from at all (see DashboardAssistant's CUSTOM_DASHBOARD_MISSING_MESSAGE) — the input is inert rather than silently failing on submit. */
  disabled?: boolean;
}

// Compact empty-state height (~1 line + padding) and the fraction of the
// panel's own height the textarea is allowed to grow into before it starts
// scrolling internally instead of pushing further — see the ResizeObserver
// effect below for how "the panel's own height" is measured.
const MIN_TEXTAREA_PX = 40;
const MAX_HEIGHT_RATIO = 0.35;

/** The message input + inline report-mode toggle + send/stop control, fixed at the bottom of the panel. */
export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  placeholder,
  fullscreen,
  reportMode,
  onToggleReportMode,
  reportModeLabel,
  reportModeSeconds,
  reportModeAvailable,
  disabled = false,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The cap in px, recomputed whenever the panel itself resizes (fullscreen
  // toggle, window resize) — a ref rather than state, since it's only ever
  // read from inside the height-sync effect below, never rendered directly.
  const maxHeightPxRef = useRef(Infinity);

  // Gemini-style auto-grow: measured against the AI Assistant panel's own
  // height (the nearest `[data-assistant-panel]` ancestor — see
  // DashboardAssistant.tsx), not the viewport, so the cap tracks whichever
  // mode (popover vs. fullscreen) is currently showing.
  useEffect(() => {
    const el = textareaRef.current;
    const panel = el?.closest<HTMLElement>("[data-assistant-panel]");
    if (!panel) return;

    const updateCap = () => {
      maxHeightPxRef.current = panel.clientHeight * MAX_HEIGHT_RATIO;
      syncHeight();
    };
    updateCap();

    const observer = new ResizeObserver(updateCap);
    observer.observe(panel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto"; // collapse first so scrollHeight reflects content, not the previous height
    const cap = maxHeightPxRef.current;
    const natural = Math.max(el.scrollHeight, MIN_TEXTAREA_PX);
    el.style.height = `${Math.min(natural, cap)}px`;
    el.style.overflowY = natural > cap ? "auto" : "hidden";
  }

  // Re-measure on every keystroke — layout effect so the resize happens
  // before paint and never visibly lags the character that triggered it.
  useLayoutEffect(syncHeight, [value]);

  return (
    <div className={cn("shrink-0 border-t border-slate-200 bg-white/80 p-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80", fullscreen && "sm:p-4")}>
      <div className={cn("mx-auto flex items-end gap-2", fullscreen && "max-w-3xl")}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={reportMode ? "Describe the report to generate" : "Message the AI Assistant"}
          className={cn(
            "ai-scrollbar block min-w-0 flex-1 resize-none rounded-2xl border bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-700 shadow-sm transition-[height,border-color,box-shadow] duration-150 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800/60",
            // A second, unmissable signal that this input is about to do
            // something expensive — colour alone on a small toggle is too easy
            // to miss before hitting Enter.
            reportMode
              ? "border-slate-900 ring-1 ring-slate-900/20 focus:border-slate-900 focus:ring-slate-900/30 dark:border-slate-300 dark:ring-slate-300/20 dark:focus:border-slate-200 dark:focus:ring-slate-300/30"
              : "border-slate-200 focus:border-slate-400 focus:ring-slate-400/40 dark:border-slate-700 dark:focus:border-slate-500 dark:focus:ring-slate-500/30"
          )}
          style={{ minHeight: MIN_TEXTAREA_PX }}
        />
        <div className="flex shrink-0 items-center gap-1.5">
          {reportModeAvailable && !disabled && (
            <ReportModeToggle
              reportMode={reportMode}
              onToggle={onToggleReportMode}
              label={reportModeLabel}
              estimatedSeconds={reportModeSeconds}
              compact
            />
          )}
          <button
            type="button"
            onClick={busy ? onStop : onSubmit}
            disabled={disabled || (!busy && !value.trim())}
            aria-label={busy ? "Stop generating" : "Send message"}
            title={busy ? "Stop generating" : "Send message (Enter)"}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-colors duration-200 disabled:opacity-40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
              busy
                ? "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-400"
                : "bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-400 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            )}
          >
            {busy ? <Square className="h-4 w-4 fill-current" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {fullscreen && (
        <p className="mt-1.5 mx-auto max-w-3xl text-left text-[0.7rem] text-slate-400 dark:text-slate-500">
          Enter to send · Shift+Enter for a new line
        </p>
      )}
    </div>
  );
}
