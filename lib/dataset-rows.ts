// Helpers for reading typed values out of uploaded CSV rows. Papa.parse with
// dynamicTyping gives back a mix of strings/numbers/booleans/nulls (and strips
// leading zeros from digit-only ids), so page adapters always go through these
// instead of trusting raw cell types.

import { toNumber } from "@/lib/infer";
import type { Dataset, DatasetRow } from "@/context/DatasetsContext";

/** "Avg PO Value" / "avg_po_value" / "avgPOValue" all normalize to "avgpovalue". */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve the first dataset column whose normalized id matches one of the
 * candidate names (in candidate priority order). Returns the actual column id
 * to index rows with, or null when none match.
 */
export function findColumn(dataset: Dataset, candidates: string[]): string | null {
  const byNorm = new Map<string, string>();
  for (const col of dataset.columns) {
    const norm = normalizeKey(col.id);
    if (!byNorm.has(norm)) byNorm.set(norm, col.id);
  }
  for (const candidate of candidates) {
    const hit = byNorm.get(normalizeKey(candidate));
    if (hit !== undefined) return hit;
  }
  return null;
}

/** Trimmed string form of a cell; "" for null/undefined/empty. */
export function cellString(row: DatasetRow, column: string | null): string {
  if (!column) return "";
  const v = row[column];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Numeric form of a cell (tolerant of ₹/,/% formatting); null when absent/unparseable. */
export function cellNumber(row: DatasetRow, column: string | null): number | null {
  if (!column) return null;
  return toNumber(row[column]);
}

/** Boolean form of a cell ("true"/"false"/1/0 tolerated); null when absent. */
export function cellBoolean(row: DatasetRow, column: string | null): boolean | null {
  if (!column) return null;
  const v = row[column];
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "yes" || s === "1") return true;
  if (s === "false" || s === "no" || s === "0") return false;
  return null;
}
