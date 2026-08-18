"use client";

import { buildDatasetProfile } from "@/lib/ai/profile/build-profile";
import { projectRows } from "@/lib/generated-dashboard/fields";
import { splitInitialWidgets } from "@/lib/generated-dashboard/select-initial";
import { createGeneratedDashboard } from "@/lib/generated-dashboard/store";
import { validateWidgets } from "@/lib/generated-dashboard/validate";
import type {
  DashboardPlan,
  GeneratedDashboard,
  GeneratedDashboardSourceKind,
  WidgetSpecDraft,
} from "@/types/generated-dashboard";

// The half of Generate Custom Dashboard that both data sources share: take
// rows plus the fields the user picked, and end up with a stored, renderable
// GeneratedDashboard.
//
// Extracted from the dialog when the flow gained a second entry point. An
// uploaded CSV and a platform spend table differ only in how their rows were
// obtained — by the time either reaches here they are the same array of
// objects, so the profile -> plan -> validate -> split -> store pipeline is
// written once and neither branch can drift from the other.

/**
 * The stages worth reporting, in order. Parsing/fetching deliberately isn't
 * one: that happens before the user picks fields, and shows its own spinner on
 * the step that owns it.
 */
export type GenerationStage = "profile" | "plan" | "widgets" | "finalize";

interface GenerateDashboardResponse {
  plan: DashboardPlan;
  widgets: WidgetSpecDraft[];
  error?: string;
}

export interface GenerateDashboardInput {
  /** Every row of the source, before field selection is applied. */
  rows: Record<string, unknown>[];
  /** Column names the user chose — everything else is dropped here. */
  fields: string[];
  /** Shown as the dashboard's provenance: a file name, or a spend table's label. */
  sourceLabel: string;
  sourceKind: GeneratedDashboardSourceKind;
  onStage?: (stage: GenerationStage) => void;
}

/** Let React paint the new stage before a synchronous step blocks the thread. */
export function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Profile the selected fields, have Claude plan a dashboard over them, and
 * store the validated result. Resolves with the stored record (the caller
 * routes to it); rejects with a message already fit to show the user.
 *
 * The profile is rebuilt from the *projected* rows rather than filtered down
 * from an earlier one: candidate ranking and long/wide shape detection are
 * both relative to the column set, so a profile describing columns that were
 * dropped would have the model planning widgets over data it won't be given.
 */
export async function generateDashboard({
  rows,
  fields,
  sourceLabel,
  sourceKind,
  onStage,
}: GenerateDashboardInput): Promise<GeneratedDashboard> {
  onStage?.("profile");
  await yieldToPaint();
  const projected = projectRows(rows, fields);
  const profile = buildDatasetProfile(projected);

  onStage?.("plan");
  const response = await fetch("/api/generate-dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, sourceFileName: sourceLabel }),
  });

  let payload: GenerateDashboardResponse | null = null;
  try {
    payload = (await response.json()) as GenerateDashboardResponse;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload) {
    throw new Error(
      payload?.error ??
        `Dashboard generation failed (HTTP ${response.status}). Please try again.`
    );
  }

  onStage?.("finalize");
  await yieldToPaint();

  const validatedWidgets = validateWidgets(payload.widgets ?? [], profile);
  if (validatedWidgets.length === 0) {
    throw new Error(
      "The model's dashboard plan didn't produce any widgets that match the fields you selected. Try a different selection, or try again."
    );
  }

  // The model plans a deliberately broad set and flags which widgets carry the
  // core story; this splits that into the opening screen and the searchable
  // "Add Widget" catalog behind it.
  const { initial, library } = splitInitialWidgets(payload.plan, validatedWidgets);

  return createGeneratedDashboard({
    title: payload.plan.title,
    sourceFileName: sourceLabel,
    sourceKind,
    profile,
    plan: payload.plan,
    widgets: initial,
    library,
    rows: projected,
    columns: fields,
  });
}
