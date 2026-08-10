"use client";

import { motion } from "framer-motion";
import { Activity, AlertTriangle, BookOpenText, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { SuggestionChips, type Suggestion } from "./SuggestionChips";

interface EmptyStateProps {
  dashboardLabel: string;
  welcomeText: string;
  onSelect: (text: string) => void;
  disabled?: boolean;
  /** The compact popup is a fixed narrow width — keep the starter grid single-column there. */
  fullscreen?: boolean;
}

/**
 * Onboarding screen shown before the user has sent their first message
 * (messages.length === 1, i.e. only the seeded welcome turn). The subtitle
 * is the assistant's own real welcome copy (`welcomeFor(dashboardKey)`) —
 * nothing here is fabricated data, just a richer presentation of it plus a
 * set of generic starter prompts that route through the existing `send()`.
 */
export function EmptyState({ dashboardLabel, welcomeText, onSelect, disabled, fullscreen }: EmptyStateProps) {
  const allStarters: Suggestion[] = [
    { label: "Top vendors", value: "Show top vendors", description: "Rank suppliers by spend on this dashboard", icon: Trophy },
    { label: "Spend trend", value: "Show the spend trend over time", description: "Visualize how spend has moved over time", icon: TrendingUp },
    { label: "Compare periods", value: "Compare this month with last month", description: "Spot period-over-period movement", icon: Activity },
    { label: "Find unusual changes", value: "Show unusual spending", description: "Flag outliers worth a closer look", icon: AlertTriangle },
    { label: "Explain this metric", value: `Explain the ${dashboardLabel} dashboard`, description: "Get a walkthrough of what's shown here", icon: BookOpenText },
  ];
  // The compact popup is short on vertical space — 5 stacked cards need
  // scrolling before the user sees the composer at all. 3 stays within the
  // "3–5 suggested questions" range and mostly fits without scrolling; the
  // full-screen surface has room for all 5.
  const starters = fullscreen ? allStarters : allStarters.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("mx-auto flex max-w-2xl flex-col items-center text-center", fullscreen ? "px-4 py-10" : "px-1 py-4")}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-sm",
          fullscreen ? "h-12 w-12" : "h-9 w-9"
        )}
      >
        <Sparkles className={fullscreen ? "h-6 w-6" : "h-4 w-4"} />
      </span>
      <h2 className={cn("font-semibold text-slate-900 dark:text-slate-100", fullscreen ? "mt-4 text-lg" : "mt-2.5 text-sm")}>
        {fullscreen ? "What would you like to analyze?" : "Ask me about this dashboard"}
      </h2>
      <p
        className={cn(
          "max-w-md leading-relaxed text-slate-500 dark:text-slate-400",
          fullscreen ? "mt-1.5 text-sm" : "mt-1 line-clamp-3 text-xs"
        )}
      >
        {welcomeText}
      </p>

      <SuggestionChips
        items={starters}
        onSelect={onSelect}
        disabled={disabled}
        variant="card"
        compact={!fullscreen}
        className={cn("w-full text-left", fullscreen ? "mt-6" : "mt-4")}
      />
    </motion.div>
  );
}
