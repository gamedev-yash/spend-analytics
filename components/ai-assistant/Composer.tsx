"use client";

import { Check, FileText, Send, Square } from "lucide-react";
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
   */
  reportMode: boolean;
  onToggleReportMode: () => void;
  /** Label from the action registry (lib/ai/actions/assistant-actions.ts) — never hardcoded here, so a renamed or added action needs no change in this file. */
  reportModeLabel: string;
  /** Measured expectation from the same registry entry. Surfaced because enabling this commits the user to minutes, not seconds. */
  reportModeSeconds: number;
  /** False when the current dashboard offers no report action — the toggle is then hidden rather than shown-and-broken. */
  reportModeAvailable: boolean;
}

/** The message input + send/stop control + report-mode toggle, fixed at the bottom of the panel. */
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
}: ComposerProps) {
  return (
    <div className={cn("shrink-0 border-t border-slate-200 bg-white/80 p-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80", fullscreen && "sm:p-4")}>
      {/* Above the input, not beside it: the panel is a fixed ~24rem wide, so a
          labelled control on the same row as the textarea and send button
          would crush all three. */}
      {reportModeAvailable && (
        <div className={cn("mx-auto mb-2 flex items-center gap-2", fullscreen && "max-w-3xl")}>
          <button
            type="button"
            aria-pressed={reportMode}
            onClick={onToggleReportMode}
            title={
              reportMode
                ? `Report is enabled — your next message will generate a downloadable report instead of a chat answer. Takes around ${Math.round(reportModeSeconds / 60)} minutes. Click to disable.`
                : `Enable to generate a downloadable report instead of a chat answer (${reportModeLabel}). Takes around ${Math.round(reportModeSeconds / 60)} minutes.`
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.7rem] font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1",
              // Enabled vs. disabled state, shown the way a pressed toolbar
              // button is: filled when on, outlined when off. No switch
              // affordance — this is one control with two states, not a slider.
              reportMode
                ? "border-slate-800 bg-slate-900 text-white hover:bg-slate-800 dark:border-transparent dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            <FileText className="h-3 w-3" />
            Report
            {/* The state is also spelled out in words, so "is it on?" never
                depends on remembering which fill means which. */}
            {reportMode ? (
              <>
                <Check className="h-3 w-3 text-emerald-400 dark:text-emerald-600" />
                On
              </>
            ) : (
              <span className="text-slate-400 dark:text-slate-500">Off</span>
            )}
          </button>
          {reportMode && (
            <span className="truncate text-[0.68rem] text-slate-500 dark:text-slate-400">
              Next message generates Word + Excel · ~{Math.round(reportModeSeconds / 60)} min
            </span>
          )}
        </div>
      )}

      <div className={cn("mx-auto flex items-end gap-2", fullscreen && "max-w-3xl")}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={2}
          placeholder={placeholder}
          aria-label={reportMode ? "Describe the report to generate" : "Message the AI Assistant"}
          className={cn(
            "min-h-0 flex-1 resize-none rounded-2xl border bg-white px-4 py-3 text-sm text-slate-700 shadow-sm transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500",
            // A second, unmissable signal that this input is about to do
            // something expensive — colour alone on a small toggle is too easy
            // to miss before hitting Enter.
            reportMode
              ? "border-slate-900 ring-1 ring-slate-900/20 focus:border-slate-900 focus:ring-slate-900/30 dark:border-slate-300 dark:ring-slate-300/20 dark:focus:border-slate-200 dark:focus:ring-slate-300/30"
              : "border-slate-200 focus:border-slate-400 focus:ring-slate-400/40 dark:border-slate-700 dark:focus:border-slate-500 dark:focus:ring-slate-500/30"
          )}
        />
        <button
          type="button"
          onClick={busy ? onStop : onSubmit}
          disabled={!busy && !value.trim()}
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
      {fullscreen && (
        <p className="mt-1.5 mx-auto max-w-3xl text-left text-[0.7rem] text-slate-400 dark:text-slate-500">
          Enter to send · Shift+Enter for a new line
        </p>
      )}
    </div>
  );
}
