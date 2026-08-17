"use client";

import { motion } from "framer-motion";
import { Activity, AlertTriangle, BookOpenText, FileText, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { SuggestionChips, type Suggestion } from "./SuggestionChips";
import type { DashboardPlan } from "@/types/generated-dashboard";

/**
 * Starters that name THIS generated dashboard's own real headline metrics
 * and sections, instead of the generic template text below — chat
 * persistence + dynamic follow-ups feature (spec §10/§18: starters must
 * adapt to whatever a custom dashboard actually contains, e.g. an inventory
 * dashboard's own metrics vs a supplier-spend one's). Built purely from
 * metadata the dashboard already carries client-side (no extra request, no
 * Claude call) — falls back to nothing (caller fills gaps with the generic
 * starters below) when a plan has too few headline metrics/sections to draw
 * from, which happens for a freshly-generated dashboard.
 */
function planHeadlineStarters(plan: DashboardPlan): Suggestion[] {
  const metrics = plan.headlineMetrics.filter((m) => m.trim().length > 0);
  const sections = [...plan.sections].sort((a, b) => a.priority - b.priority);
  const items: Suggestion[] = [];

  if (metrics[0]) {
    items.push({
      label: `About ${metrics[0]}`,
      value: `What's the current ${metrics[0]}, and what's driving it?`,
      description: "This dashboard's own headline number",
      icon: Trophy,
    });
  }
  if (sections[0]) {
    items.push({
      label: sections[0].heading,
      value: `Walk me through ${sections[0].heading.toLowerCase()} in this dashboard.`,
      description: sections[0].whyItMatters || sections[0].intent,
      icon: TrendingUp,
    });
  }
  if (metrics[1]) {
    items.push({
      label: `${metrics[1]} over time`,
      value: `How has ${metrics[1]} changed over time?`,
      description: "Movement in this dashboard's own data",
      icon: Activity,
    });
  } else if (sections[1]) {
    items.push({
      label: sections[1].heading,
      value: `Walk me through ${sections[1].heading.toLowerCase()} in this dashboard.`,
      description: sections[1].whyItMatters || sections[1].intent,
      icon: Activity,
    });
  }
  return items;
}

interface EmptyStateProps {
  dashboardLabel: string;
  /**
   * Which starter prompts make sense here. The built-in dashboards all sit on
   * the same procurement warehouse, so "Show top vendors" is a real question on
   * every one of them; a generated dashboard's subject is unknown at build time
   * (it could be inventory, headcount, anything), so it gets starters that are
   * about the DATA rather than about a domain — otherwise the first thing the
   * assistant would have to say is "this dashboard has no vendors".
   */
  dashboardKind?: "builtin" | "custom";
  welcomeText: string;
  onSelect: (text: string) => void;
  disabled?: boolean;
  /** The compact popup is a fixed narrow width — keep the starter grid single-column there. */
  fullscreen?: boolean;
  /**
   * Turns Report Mode on and puts the cursor in the composer. Omitted when the
   * current dashboard offers no report action, which is what hides the card
   * rather than showing one that cannot work.
   *
   * Note what this does NOT do: it does not generate anything. There is no
   * objective yet at the empty state, and firing a ~3-minute analysis off a
   * click with nothing to analyse would be the worst version of this feature.
   * The card arms the mode; the user still says what they want.
   */
  onEnableReportMode?: () => void;
  /** Reflected in the card's copy so it reads as "already on" rather than inviting a second click. */
  reportMode?: boolean;
  /** Only meaningful for a custom dashboard — its own headline metrics/sections, used to template starters that name real data instead of generic phrasing. See planHeadlineStarters above. */
  plan?: DashboardPlan;
}

/**
 * Onboarding screen shown before the user has sent their first message
 * (messages.length === 1, i.e. only the seeded welcome turn). The subtitle
 * is the assistant's own real welcome copy (`welcomeFor(dashboardKey)`) —
 * nothing here is fabricated data, just a richer presentation of it plus a
 * set of generic starter prompts that route through the existing `send()`.
 */
export function EmptyState({
  dashboardLabel,
  dashboardKind = "builtin",
  welcomeText,
  onSelect,
  disabled,
  fullscreen,
  onEnableReportMode,
  reportMode,
  plan,
}: EmptyStateProps) {
  const builtinStarters: Suggestion[] = [
    { label: "Top vendors", value: "Show top vendors", description: "Rank suppliers by spend on this dashboard", icon: Trophy },
    { label: "Spend trend", value: "Show the spend trend over time", description: "Visualize how spend has moved over time", icon: TrendingUp },
    { label: "Compare periods", value: "Compare this month with last month", description: "Spot period-over-period movement", icon: Activity },
    { label: "Find unusual changes", value: "Show unusual spending", description: "Flag outliers worth a closer look", icon: AlertTriangle },
    { label: "Explain this metric", value: `Explain the ${dashboardLabel} dashboard`, description: "Get a walkthrough of what's shown here", icon: BookOpenText },
  ];
  // Phrased against whatever this dashboard turns out to hold: the model reads
  // its own schema and picks the columns, so none of these presume a subject.
  const customStarters: Suggestion[] = [
    { label: "Headline numbers", value: "What are the headline numbers in this dashboard?", description: "The totals this data leads with", icon: Trophy },
    { label: "Top contributors", value: "What are the top contributors to the main measure, and how concentrated are they?", description: "Where the biggest values sit", icon: TrendingUp },
    { label: "Trend over time", value: "How has the main measure changed over time?", description: "Movement across the periods in this data", icon: Activity },
    { label: "Outliers", value: "Which records or groups look unusual compared with the rest?", description: "Flag anything worth a closer look", icon: AlertTriangle },
    { label: "What's in here", value: "What does this dashboard cover, and what can you answer from it?", description: "A walkthrough of this dataset's scope", icon: BookOpenText },
  ];
  // A generated dashboard's own metrics/sections beat the generic template
  // text whenever there's enough plan data to draw from — see
  // planHeadlineStarters above. Gaps (a fresh plan with few headline metrics)
  // are filled from the generic set rather than showing fewer than 3.
  const dynamicStarters = dashboardKind === "custom" && plan ? planHeadlineStarters(plan) : [];
  const allStarters =
    dashboardKind === "custom"
      ? dynamicStarters.length > 0
        ? [...dynamicStarters, ...customStarters].slice(0, 5)
        : customStarters
      : builtinStarters;
  // The compact popup is short on vertical space — 5 stacked cards need
  // scrolling before the user sees the composer at all. 3 stays within the
  // "3–5 suggested questions" range and mostly fits without scrolling; the
  // full-screen surface has room for all 5.
  const starters = fullscreen ? allStarters : allStarters.slice(0, 3);

  // Appended AFTER the slice, not included in it, so the report card survives the
  // compact popup's 3-card trim instead of competing with the starters for a slot.
  const items: Suggestion[] = onEnableReportMode
    ? [
        ...starters,
        {
          label: reportMode ? "Report mode is on" : "Generate report",
          description: reportMode
            ? "Type what to analyse — you'll get Word + Excel"
            : "Turn on Report mode, then describe what to analyse",
          icon: FileText,
          emphasis: true,
          action: onEnableReportMode,
        },
      ]
    : starters;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("mx-auto flex max-w-2xl flex-col items-center text-center", fullscreen ? "px-4 py-10" : "px-1 py-4")}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-2xl bg-slate-100 text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-200",
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
        items={items}
        onSelect={onSelect}
        disabled={disabled}
        variant="card"
        compact={!fullscreen}
        className={cn("w-full text-left", fullscreen ? "mt-6" : "mt-4")}
      />
    </motion.div>
  );
}
