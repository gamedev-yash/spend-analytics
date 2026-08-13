"use client";

// The in-chat surface for a report: progress while it runs, then the two
// download links and nothing else.
//
// DELIBERATELY DOES NOT RENDER THE REPORT. The transcript is for conversation;
// a ten-section executive report pasted into a 24rem chat panel is neither
// readable there nor useful there — the Word and Excel files are the
// deliverable, and this card's whole job is to hand them over. It therefore
// shows only what you need in order to know WHICH file you are downloading:
// the report's title, plus a note when the objective reached past what the
// dashboard could answer.
//
// The full ActionPlanResult still arrives in the API response and is still the
// single source of truth behind both documents. Not rendering it here is a
// presentation decision, not a narrowing of the contract — so bringing an
// in-chat preview back later needs no server change.
//
// THE PROGRESS STEPS ARE HONEST ABOUT WHAT THEY ARE. The server does not stream
// stage events (the workflow is one POST), so these name the phases the request
// really goes through but are paced client-side, NOT driven by server progress.
// They are never presented as live telemetry: the final step stays pending
// until the real response lands, and everything resolves at once when it does.

import { useEffect, useState } from "react";
import { AlertCircle, Check, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import type { ActionPlanResult, ArtifactDescriptor } from "@/lib/ai/actions/action-plan-types";
import { cn } from "@/lib/utils";

export type ActionPlanStatus = "running" | "done" | "error";

export interface ActionPlanState {
  status: ActionPlanStatus;
  /** The action's own label, so the card names what is running. */
  label: string;
  /** Full result from the server. Only `title` is rendered — see the module comment. */
  report?: ActionPlanResult;
  artifacts?: { word: ArtifactDescriptor; excel: ArtifactDescriptor };
  cached?: boolean;
  error?: string;
}

// Named after the stages the engine really performs (see action-plan-engine's
// HOW TO WORK block), so the labels describe the actual work rather than
// inventing a plausible-sounding sequence.
const STEPS = [
  "Understanding the objective",
  "Querying dashboard data",
  "Establishing facts",
  "Analysing insights",
  "Identifying opportunities",
  "Building recommendations",
  "Preparing implementation plan",
  "Generating Word and Excel",
];

/**
 * Pace of the first three steps. Fixed and fast — NOT derived from the action's
 * estimated duration, which was the old approach and got it wrong at both ends:
 * a cached report (11ms) flashed past before a single step rendered, and a slow
 * one left three steps sitting untouched for a minute.
 *
 * Fast-then-hold works for both. The first seven tick by in ~1.8s so there is
 * always something to watch, then the LAST step holds — spinning — until the
 * real response lands. On a cached report that hold is momentary; on a live
 * generation it is minutes, which is honest, because generating is exactly
 * what's happening.
 */
const STEP_INTERVAL_MS = 260;

function ProgressSteps() {
  const [reached, setReached] = useState(0);

  useEffect(() => {
    const timers = STEPS.slice(0, -1).map((_, i) =>
      setTimeout(() => setReached(i + 1), STEP_INTERVAL_MS * (i + 1))
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <ul className="mt-2 space-y-1.5">
      {STEPS.map((step, i) => {
        const complete = i < reached;
        const active = i === reached;
        return (
          <li
            key={step}
            className={cn(
              "flex items-center gap-2 text-xs",
              complete
                ? "text-slate-500 dark:text-slate-400"
                : active
                  ? "text-slate-800 dark:text-slate-200"
                  : "text-slate-300 dark:text-slate-600"
            )}
          >
            {complete ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : active ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-current" />
            )}
            {step}
          </li>
        );
      })}
    </ul>
  );
}

function DownloadLink({
  artifact,
  icon: Icon,
  label,
}: {
  artifact: ArtifactDescriptor;
  icon: typeof FileText;
  label: string;
}) {
  if (!artifact.available || !artifact.downloadUrl) {
    return (
      <span
        title={artifact.error}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500"
      >
        <AlertCircle className="h-3 w-3" />
        {label} unavailable
      </span>
    );
  }
  return (
    <a
      href={artifact.downloadUrl}
      download={artifact.filename}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 dark:border-transparent dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
    >
      <Icon className="h-3 w-3" />
      {label}
    </a>
  );
}

export function ActionPlanCard({ state }: { state: ActionPlanState }) {
  if (state.status === "running") {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {state.label}…
        </p>
        <ProgressSteps />
        {/* Says what is actually true: the composer is in its Stop state for
            the duration, because being able to cancel a multi-minute
            generation matters more than sending a chat message mid-report. */}
        <p className="mt-2 text-[0.68rem] text-slate-400 dark:text-slate-500">
          This can take a while — press Stop to cancel.
        </p>
      </div>
    );
  }

  if (state.status === "error" || !state.report || !state.artifacts) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
        <p className="flex items-center gap-1.5 font-medium">
          <AlertCircle className="h-3.5 w-3.5" />
          Report generation failed
        </p>
        <p className="mt-1">{state.error ?? "Something went wrong generating that report."}</p>
      </div>
    );
  }

  const { report, artifacts } = state;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" />
        Report ready
        {state.cached && <span className="font-normal text-slate-400 dark:text-slate-500">· reused</span>}
      </p>

      {/* The title only — enough to know which file you are about to open,
          without reproducing the report in the transcript. */}
      <p className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{report.title}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <DownloadLink artifact={artifacts.word} icon={FileText} label="Download Word" />
        <DownloadLink artifact={artifacts.excel} icon={FileSpreadsheet} label="Download Excel" />
      </div>

      {/* Surfaced because it is the one thing the reader can't infer: the
          objective reached past what this dashboard carries. The count only —
          the documents themselves list the gaps. */}
      {report.dataGaps.length > 0 && (
        <p className="mt-2 text-[0.68rem] text-amber-600 dark:text-amber-400">
          {report.dataGaps.length} item{report.dataGaps.length === 1 ? "" : "s"} this dashboard couldn&apos;t
          answer — listed in the report.
        </p>
      )}
    </div>
  );
}
