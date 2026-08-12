"use client";

// The explicit action row shown under the last assistant answer.
//
// USER-TRIGGERED, ALWAYS. Nothing here fires on mount, on render, or on a
// model signal — the only path to running an action is a click. That is the
// product requirement (§1/§15) and it is also why this is a plain button row
// rather than anything the assistant can influence.
//
// Rendered from the ASSISTANT_ACTIONS registry rather than hardcoded, so
// adding "Generate Executive Summary" later is a registry entry plus a
// generator, with no change to this component or to DashboardAssistant.

import { Sparkles } from "lucide-react";
import { assistantActionsFor, type AssistantActionDefinition } from "@/lib/ai/actions/assistant-actions";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";

interface AssistantActionsProps {
  dashboardKey: DashboardKey;
  onRun: (action: AssistantActionDefinition) => void;
  /** True while any action (or a chat turn) is in flight — the row stays visible but inert, so it doesn't flicker in and out. */
  disabled: boolean;
}

export function AssistantActions({ dashboardKey, onRun, disabled }: AssistantActionsProps) {
  const actions = assistantActionsFor(dashboardKey);
  if (actions.length === 0) return null;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700/60">
      <p className="mb-1.5 text-[0.7rem] font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">
        Actions
      </p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            onClick={() => onRun(action)}
            title={`${action.description} Takes around ${action.estimatedSeconds} seconds.`}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-transparent dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:focus-visible:ring-slate-500"
          >
            <Sparkles className="h-3 w-3" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
