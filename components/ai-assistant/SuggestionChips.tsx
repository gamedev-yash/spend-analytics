"use client";

import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface Suggestion {
  /** Short text shown on the chip/card — kept terse so it fits the compact popup. */
  label: string;
  /** The full text actually sent through `send()` when this suggestion is picked — falls back to `label` when omitted, so a short display label (e.g. "Compare") can still send a real, unambiguous question ("Compare with last month"). */
  value?: string;
  /** Optional longer description — only rendered by the "card" variant. */
  description?: string;
  icon?: LucideIcon;
  /**
   * Runs INSTEAD of sending `value` through the chat path.
   *
   * Every other suggestion here is a canned prompt, so "picking one" means
   * "send this text". A few surfaces need a tile that changes assistant state
   * rather than asking a question — the empty state's Report Mode card being
   * the first. Modelling that as an optional override keeps one card renderer
   * and one grid layout, instead of a second component that merely looks the
   * same.
   */
  action?: () => void;
  /** Renders the tile in the accented "this is an action, not a question" style. Only meaningful with `action`. */
  emphasis?: boolean;
}

interface SuggestionChipsProps {
  items: Suggestion[];
  onSelect: (text: string) => void;
  disabled?: boolean;
  /**
   * "card" — larger tiles with icon + description, used for the empty-state
   * onboarding grid. "pill" — compact rounded buttons, used for clarifying
   * options and post-answer follow-ups.
   */
  variant?: "card" | "pill";
  /**
   * Force a single-column card grid instead of the responsive 2/3-column
   * layout. The compact popup panel is a fixed ~24rem regardless of the
   * browser's actual viewport width, so Tailwind's viewport-based `sm:`/`lg:`
   * breakpoints would still fire and cram multiple columns into that narrow
   * panel — this switches the grid by container (the `fullscreen` flag the
   * caller already tracks) instead of by viewport.
   */
  compact?: boolean;
  className?: string;
}

/**
 * Shared renderer for every "click to send a canned prompt" surface in the
 * assistant: empty-state starters, the existing ask_with_options clarifying
 * choices, and post-answer follow-up suggestions. All three ultimately call
 * the same `onSelect` → the real `send()` in DashboardAssistant — no new
 * request path, just three different sources of button labels.
 */
export function SuggestionChips({ items, onSelect, disabled, variant = "pill", compact, className }: SuggestionChipsProps) {
  if (items.length === 0) return null;

  if (variant === "card") {
    return (
      <div className={cn("grid grid-cols-1 gap-2.5", !compact && "sm:grid-cols-2 lg:grid-cols-3", className)}>
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.label}
              type="button"
              disabled={disabled}
              onClick={() => (item.action ? item.action() : onSelect(item.value ?? item.label))}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03, ease: "easeOut" }}
              whileHover={disabled ? undefined : { y: -1 }}
              className={cn(
                "group flex text-left shadow-sm transition-colors duration-200",
                "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-50",
                // An emphasised tile is a MODE/ACTION, not a question — given a
                // darker border and a tinted ground so it reads as a different
                // kind of thing at a glance, without leaving the same grid.
                item.emphasis
                  ? "border border-slate-900 bg-slate-900/[0.04] hover:bg-slate-900/[0.07] dark:border-slate-300 dark:bg-slate-100/[0.06] dark:hover:bg-slate-100/10 dark:focus-visible:ring-slate-400"
                  : "border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800 dark:focus-visible:ring-slate-500",
                // Compact: one tight row (icon + label, description truncated
                // to a single line below) so 3 cards fit the popup without
                // scrolling. Full-screen: the roomier stacked layout.
                compact ? "flex-col gap-1 rounded-lg p-2.5" : "flex-col items-start gap-1.5 rounded-xl p-3.5"
              )}
            >
              <span className={cn("flex items-center", compact ? "gap-2" : "flex-col items-start gap-1.5")}>
                {Icon && (
                  <span
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-lg transition-colors",
                      item.emphasis
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "bg-slate-100 text-slate-500 group-hover:bg-slate-900 group-hover:text-white dark:bg-slate-700/60 dark:text-slate-300 dark:group-hover:bg-slate-200 dark:group-hover:text-slate-900",
                      compact ? "h-7 w-7" : "h-8 w-8"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                )}
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.label}</span>
              </span>
              {item.description && (
                <span className={cn("text-slate-500 dark:text-slate-400", compact ? "truncate text-[0.7rem] pl-9" : "text-xs leading-snug")}>
                  {item.description}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            disabled={disabled}
            onClick={() => (item.action ? item.action() : onSelect(item.value ?? item.label))}
            title={item.value && item.value !== item.label ? item.value : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors",
              "hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-slate-500"
            )}
          >
            {Icon && <Icon className="h-3 w-3" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
