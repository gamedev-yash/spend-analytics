"use client";

// The in-chat surface for a report: progress while it runs, then the summary
// plus download links.
//
// THE PROGRESS STEPS ARE HONEST ABOUT WHAT THEY ARE. The server does not
// stream stage events (the workflow is one POST), so these are a client-side
// indication of the phases the request goes through, advanced on a timer
// derived from the action's own estimatedSeconds. They are never presented as
// live telemetry: the final step stays pending until the real response lands,
// and every step resolves at once when it does. The alternative — inventing
// server-sent stage events for a demo — would be a streaming architecture
// this feature does not need.
//
// It renders ONLY what the server returned. No figure, recommendation, or
// benefit is computed, reformatted, or supplemented here, which is the same
// discipline the Word and Excel renderers follow — the panel is a third
// projection of the one ActionPlanResult, not a fourth source of truth.

import { useEffect, useState } from "react";
import { AlertCircle, Check, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import type { ActionPlanResult, ArtifactDescriptor } from "@/lib/ai/actions/action-plan-types";
import { cn } from "@/lib/utils";

export type ActionPlanStatus = "running" | "done" | "error";

export interface ActionPlanState {
  status: ActionPlanStatus;
  /** The action's own label, so the card names what is running. */
  label: string;
  estimatedSeconds: number;
  report?: ActionPlanResult;
  artifacts?: { word: ArtifactDescriptor; excel: ArtifactDescriptor };
  generator?: "demo" | "dynamic";
  cached?: boolean;
  error?: string;
}

const STEPS = [
  "Analysing dashboard data",
  "Identifying insights",
  "Building recommendations",
  "Generating report files",
];

function ProgressSteps({ estimatedSeconds }: { estimatedSeconds: number }) {
  const [reached, setReached] = useState(0);

  // Paced across the action's estimate, and deliberately stops one short of
  // the end: the last step can only be completed by a real response, so it
  // never claims the files exist before they do.
  useEffect(() => {
    const perStepMs = Math.max(1200, (estimatedSeconds * 1000) / STEPS.length);
    const timers = STEPS.slice(0, -1).map((_, i) =>
      setTimeout(() => setReached(i + 1), perStepMs * (i + 1))
    );
    return () => timers.forEach(clearTimeout);
  }, [estimatedSeconds]);

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

function DownloadLink({ artifact, icon: Icon, label }: { artifact: ArtifactDescriptor; icon: typeof FileText; label: string }) {
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
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      <Icon className="h-3 w-3" />
      {label}
    </a>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-[0.7rem] font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">{title}</p>
      {note && <p className="mt-0.5 text-[0.68rem] text-slate-400 dark:text-slate-500">{note}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function ActionPlanCard({ state }: { state: ActionPlanState }) {
  const [expanded, setExpanded] = useState(false);

  if (state.status === "running") {
    return (
      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {state.label}…
        </p>
        <ProgressSteps estimatedSeconds={state.estimatedSeconds} />
        <p className="mt-2 text-[0.68rem] text-slate-400 dark:text-slate-500">
          You can keep chatting while this runs.
        </p>
      </div>
    );
  }

  if (state.status === "error" || !state.report || !state.artifacts) {
    return (
      <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
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
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" />
        Report generated
        {state.cached && <span className="font-normal text-slate-400 dark:text-slate-500">· reused</span>}
      </p>

      <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{report.title}</p>
      <p className="mt-0.5 text-[0.68rem] text-slate-400 dark:text-slate-500">{report.scope}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">{report.insightSummary}</p>

      <Section title="Recommended actions">
        <ul className="space-y-1">
          {report.recommendations.slice(0, expanded ? undefined : 3).map((rec, i) => (
            <li key={i} className="flex gap-1.5 text-xs text-slate-700 dark:text-slate-300">
              <span
                className={cn(
                  "mt-0.5 h-fit shrink-0 rounded px-1 py-0.5 text-[0.6rem] font-semibold uppercase",
                  rec.priority === "High"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                    : rec.priority === "Medium"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                )}
              >
                {rec.priority}
              </span>
              <span>{rec.action}</span>
            </li>
          ))}
        </ul>
      </Section>

      {expanded && (
        <>
          {/* Facts, insights, and assumptions stay visually distinct here for
              the same reason they are separate arrays in the data: an
              assumption must never read as a measured finding. */}
          <Section title="Key data" note="Values read from this dashboard's data.">
            <ul className="space-y-0.5">
              {report.facts.map((fact, i) => (
                <li key={i} className="text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-medium">{fact.label}:</span> {fact.value}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Insights" note="Derived from the data above — not measured values.">
            <ul className="list-disc space-y-0.5 pl-4">
              {report.insights.map((insight, i) => (
                <li key={i} className="text-xs text-slate-700 dark:text-slate-300">
                  {insight.insight}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Potential benefits" note="Estimates. Each is shown with its formula and assumption.">
            <ul className="space-y-1">
              {report.benefits.map((benefit, i) => (
                <li key={i} className="text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-medium">{benefit.metric}:</span>{" "}
                  {benefit.value ?? (
                    <span className="italic text-slate-400 dark:text-slate-500">
                      not quantifiable from available data
                    </span>
                  )}
                  <span className="block text-[0.68rem] text-slate-400 dark:text-slate-500">
                    {benefit.formula} — {benefit.assumption}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Assumptions" note="Conditions the estimates rest on. Not findings.">
            <ul className="list-disc space-y-0.5 pl-4">
              {report.assumptions.map((assumption, i) => (
                <li key={i} className="text-xs text-slate-600 dark:text-slate-400">
                  {assumption}
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-3 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {expanded ? "Hide report" : "View report"}
        </button>
        <DownloadLink artifact={artifacts.word} icon={FileText} label="Download Word" />
        <DownloadLink artifact={artifacts.excel} icon={FileSpreadsheet} label="Download Excel" />
      </div>

      {state.generator === "demo" && (
        <p className="mt-2 text-[0.68rem] text-amber-600 dark:text-amber-400">
          Demo content — figures come from a predefined illustrative dataset, not a live query.
        </p>
      )}
    </div>
  );
}
