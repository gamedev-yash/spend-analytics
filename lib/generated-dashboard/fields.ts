import type { ColumnProfile, ColumnRole, DatasetProfile } from "@/types/dataset-profile";

// Turns a DatasetProfile into the dimension/measure picker's model, and
// narrows the dataset to what the user picked.
//
// Nothing here re-classifies anything: buildDatasetProfile
// (lib/ai/profile/build-profile.ts) has already decided every column's role
// and ranked the candidates worth charting. This module only groups those
// roles into the four buckets a person thinks in, writes one human line per
// column, and enforces the minimum a dashboard actually needs.
//
// Shared verbatim by both data sources — an uploaded CSV and a platform spend
// table reach the picker as the same FieldOption[], so there is one selection
// UI rather than one per branch.

export type FieldGroup = "measure" | "dimension" | "temporal" | "other";

export interface FieldOption {
  /** Column name, exactly as it appears as a key on each row. */
  name: string;
  group: FieldGroup;
  /** One line summarising what's actually in the column. */
  detail: string;
  /** In the profile's ranked candidate list — what the default selection uses. */
  recommended: boolean;
}

export const FIELD_GROUP_ORDER: FieldGroup[] = ["measure", "dimension", "temporal", "other"];

export const FIELD_GROUP_LABELS: Record<FieldGroup, string> = {
  measure: "Measures",
  dimension: "Dimensions",
  temporal: "Time",
  other: "Other columns",
};

export const FIELD_GROUP_HINTS: Record<FieldGroup, string> = {
  measure: "Numbers to total or average — spend, counts, quantities.",
  dimension: "Categories to break those numbers down by — supplier, category, plant.",
  temporal: "Dates that turn the dashboard into a trend.",
  other: "Identifiers, free text and single-value columns. Rarely worth charting.",
};

const GROUP_BY_ROLE: Record<ColumnRole, FieldGroup> = {
  measure: "measure",
  dimension: "dimension",
  temporal: "temporal",
  identifier: "other",
  text: "other",
  constant: "other",
};

/**
 * Which bucket a column is *shown* under, which is not quite its role.
 *
 * build-profile caps the "dimension" role at 200 distinct values, because past
 * that a column stops being a sane default chart grouping. That's the right
 * rule for planning and the wrong one for a menu: on Purchase Orders it demotes
 * `vendor_name` — 351 suppliers, the single field a procurement dashboard is
 * most likely to be about — to "text", i.e. into the collapsed Other group,
 * where nobody would think to look for Supplier.
 *
 * So a text column that still profiled as categorical (build-profile only
 * computes those stats when a column is plausibly a category at all, and the
 * identifier role is excluded here) is listed under Dimensions. Listed, not
 * recommended: `recommended` still comes straight from the profile's candidate
 * ranking, so the default selection is exactly what the planner would have been
 * given anyway. This moves the field to where it's findable; it doesn't
 * second-guess the profiler about what to chart by default.
 */
function groupFor(col: ColumnProfile): FieldGroup {
  if (col.role === "text" && col.categorical) return "dimension";
  return GROUP_BY_ROLE[col.role] ?? "other";
}

/** Cap on the fallback selections below — enough to plan a dashboard from, few enough to stay legible. */
const MAX_FALLBACK_FIELDS = 12;

const compactNumber = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const plainNumber = new Intl.NumberFormat("en-IN");

/** ISO timestamp -> the date half, which is all a range summary needs. */
function day(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * A single line describing one column, in the terms someone deciding whether
 * to chart it cares about: what values it holds and how many, not its type.
 */
export function describeColumn(col: ColumnProfile): string {
  if (col.isConstant) return "Single repeated value";

  // Checked before the stat blocks: a high-cardinality identifier profiles as
  // text (see build-profile's categorical eligibility rule), so "free text"
  // would be the one thing said about a column that's obviously a key.
  if (col.role === "identifier") {
    return `Looks like a key · ${plainNumber.format(col.distinctCount)} distinct values`;
  }

  if (col.numeric) {
    const n = col.numeric;
    const range = `${compactNumber.format(n.min)} – ${compactNumber.format(n.max)}`;
    return n.looksLikeYear
      ? `${range} · looks like a year, not a quantity`
      : `${range} · totals ${compactNumber.format(n.sum)}`;
  }

  if (col.temporal) {
    const t = col.temporal;
    return `${day(t.minDate)} → ${day(t.maxDate)} · ${t.granularity} grain`;
  }

  if (col.categorical) {
    const top = col.categorical.topValues
      .slice(0, 3)
      .map((v) => v.value)
      .join(", ");
    const count = `${plainNumber.format(col.distinctCount)} values`;
    return top ? `${count} · ${top}…` : count;
  }

  if (col.text) {
    return `Free text · ${plainNumber.format(col.distinctCount)} distinct`;
  }

  return `${plainNumber.format(col.distinctCount)} distinct values`;
}

/** Every column in the profile, in source order, as a pickable field. */
export function describeFields(profile: DatasetProfile): FieldOption[] {
  const recommended = new Set([
    ...profile.candidates.measures,
    ...profile.candidates.dimensions,
    ...profile.candidates.temporal,
  ]);

  return profile.columns.map((col) => ({
    name: col.name,
    group: groupFor(col),
    detail: describeColumn(col),
    recommended: recommended.has(col.name),
  }));
}

/**
 * What the picker opens with: the profile's own ranked candidates, which is
 * exactly the set the AI planner would otherwise have been handed. Falling
 * back twice — to anything chartable, then to anything at all — so a dataset
 * of nothing but identifiers still opens on a selection the user can edit
 * rather than an empty form with the Generate button disabled.
 */
export function defaultFieldSelection(fields: FieldOption[]): string[] {
  const recommended = fields.filter((f) => f.recommended);
  if (recommended.length > 0) return recommended.map((f) => f.name);

  const chartable = fields.filter((f) => f.group !== "other");
  if (chartable.length > 0) return chartable.slice(0, MAX_FALLBACK_FIELDS).map((f) => f.name);

  return fields.slice(0, MAX_FALLBACK_FIELDS).map((f) => f.name);
}

/**
 * Narrow every row to the chosen columns. This is what keeps a generated
 * dashboard storable: the record embeds its rows (see store.ts), so dropping
 * the twenty columns nobody selected is the difference between a dashboard
 * that persists and one that trips localStorage's quota.
 */
export function projectRows(
  rows: Record<string, unknown>[],
  columns: string[]
): Record<string, unknown>[] {
  return rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const column of columns) {
      if (column in row) next[column] = row[column];
    }
    return next;
  });
}

export interface FieldSelectionStatus {
  /** Blocks generation until resolved. */
  error: string | null;
  /** Worth saying, but the user may well mean it. */
  hint: string | null;
}

/**
 * The floor a selection has to clear. Only two things genuinely break a
 * dashboard — nothing selected, and no number to plot when numbers were on
 * offer. "No grouping column" is a real outcome (a KPI-only dashboard), not a
 * mistake, so it's a hint rather than a block.
 */
export function checkFieldSelection(
  fields: FieldOption[],
  selected: string[]
): FieldSelectionStatus {
  const chosen = new Set(selected);
  const offers = (group: FieldGroup) => fields.some((f) => f.group === group);
  const has = (group: FieldGroup) => fields.some((f) => f.group === group && chosen.has(f.name));

  if (chosen.size === 0) {
    return { error: "Select at least one field to build a dashboard from.", hint: null };
  }
  if (offers("measure") && !has("measure")) {
    return {
      error: "Select at least one measure — a dashboard needs a number to chart.",
      hint: null,
    };
  }
  if (!has("dimension") && !has("temporal")) {
    return {
      error: null,
      hint: "Nothing to group by is selected, so expect KPI tiles rather than charts.",
    };
  }
  return { error: null, hint: null };
}
