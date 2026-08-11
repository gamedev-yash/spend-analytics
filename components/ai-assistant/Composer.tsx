"use client";

import { Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  placeholder: string;
  fullscreen: boolean;
}

/** The message input + send/stop control, fixed at the bottom of the panel. */
export function Composer({ value, onChange, onSubmit, onStop, busy, placeholder, fullscreen }: ComposerProps) {
  return (
    <div className={cn("shrink-0 border-t border-slate-200 bg-white/80 p-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80", fullscreen && "sm:p-4")}>
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
          aria-label="Message the AI Assistant"
          className="min-h-0 flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm transition-colors placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-500/30"
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
