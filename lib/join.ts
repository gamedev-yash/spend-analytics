// In-memory relational joins between two uploaded datasets. The output is an
// ordinary rows+columns pair — materialized by DatasetsContext into a normal
// Dataset, so every page adapter works on joined data unchanged.

import { inferColumns, type ColumnMeta } from "@/lib/infer";
import type { Dataset, DatasetRow } from "@/context/DatasetsContext";

export type JoinType = "inner" | "left";

export interface JoinOutput {
  rows: DatasetRow[];
  columns: ColumnMeta[];
  /** How many left rows found at least one right match (drives the preview). */
  matchedLeftRows: number;
}

/** Safety cap — a many-to-many key explosion aborts instead of freezing the tab. */
const MAX_JOIN_ROWS = 200_000;

/**
 * Join keys compare as trimmed strings so digit-only ids join cleanly even
 * when PapaParse's dynamicTyping stripped leading zeros on one side
 * ("0000100153" vs 100153 → both "100153" only if BOTH sides were typed the
 * same way; trimming + stringifying at least makes number-vs-string sides
 * agree). Null/undefined/empty keys never match anything.
 */
function joinKeyOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** "dim_vendor.csv" -> "dim_vendor" — prefix for right-side column collisions. */
function collisionPrefix(datasetName: string): string {
  const base = datasetName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return base || "right";
}

/** Index right-side rows by their normalized join key (one-to-many aware). */
function indexRightRows(rows: DatasetRow[], rightKey: string): Map<string, DatasetRow[]> {
  const index = new Map<string, DatasetRow[]>();
  for (const row of rows) {
    const key = joinKeyOf(row[rightKey]);
    if (key === null) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(row);
    else index.set(key, [row]);
  }
  return index;
}

/** Left rows with at least one right match — cheap preview for the join dialog. */
export function countJoinMatches(
  leftDataset: Dataset,
  rightDataset: Dataset,
  leftKey: string,
  rightKey: string
): { matchedLeftRows: number; leftRows: number } {
  const rightKeys = new Set<string>();
  for (const row of rightDataset.rows) {
    const key = joinKeyOf(row[rightKey]);
    if (key !== null) rightKeys.add(key);
  }
  let matched = 0;
  for (const row of leftDataset.rows) {
    const key = joinKeyOf(row[leftKey]);
    if (key !== null && rightKeys.has(key)) matched += 1;
  }
  return { matchedLeftRows: matched, leftRows: leftDataset.rows.length };
}

/**
 * Relational join of two datasets on one key column each.
 *
 * - `inner` keeps only left rows with a right match; `left` keeps every left
 *   row, filling right columns with null when unmatched.
 * - The right key column is dropped (its values duplicate the left key); any
 *   other right column whose id collides with a left column id is prefixed
 *   with the right dataset's name ("dim_vendor_created_at").
 * - Output columns are re-inferred over the joined rows via inferColumns().
 */
export function joinDatasets(
  leftDataset: Dataset,
  rightDataset: Dataset,
  leftKey: string,
  rightKey: string,
  joinType: JoinType
): JoinOutput {
  if (!leftDataset.columns.some((c) => c.id === leftKey)) {
    throw new Error(`Left key column "${leftKey}" not found in "${leftDataset.name}".`);
  }
  if (!rightDataset.columns.some((c) => c.id === rightKey)) {
    throw new Error(`Right key column "${rightKey}" not found in "${rightDataset.name}".`);
  }

  const leftColumnIds = new Set(leftDataset.columns.map((c) => c.id));
  const prefix = collisionPrefix(rightDataset.name);
  const rightColumnMap = rightDataset.columns
    .filter((c) => c.id !== rightKey)
    .map((c) => {
      if (!leftColumnIds.has(c.id)) return { srcId: c.id, outId: c.id };
      let outId = `${prefix}_${c.id}`;
      let n = 2;
      while (leftColumnIds.has(outId)) outId = `${prefix}_${c.id}_${n++}`;
      return { srcId: c.id, outId };
    });

  const rightIndex = indexRightRows(rightDataset.rows, rightKey);

  const rows: DatasetRow[] = [];
  let matchedLeftRows = 0;
  for (const leftRow of leftDataset.rows) {
    const key = joinKeyOf(leftRow[leftKey]);
    const matches = key !== null ? rightIndex.get(key) : undefined;
    if (matches && matches.length > 0) {
      matchedLeftRows += 1;
      for (const rightRow of matches) {
        const row: DatasetRow = { ...leftRow };
        for (const col of rightColumnMap) row[col.outId] = rightRow[col.srcId];
        rows.push(row);
        if (rows.length > MAX_JOIN_ROWS) {
          throw new Error(
            `Join aborted: more than ${MAX_JOIN_ROWS.toLocaleString()} output rows — the key columns look many-to-many.`
          );
        }
      }
    } else if (joinType === "left") {
      const row: DatasetRow = { ...leftRow };
      for (const col of rightColumnMap) row[col.outId] = null;
      rows.push(row);
      if (rows.length > MAX_JOIN_ROWS) {
        throw new Error(
          `Join aborted: more than ${MAX_JOIN_ROWS.toLocaleString()} output rows — the key columns look many-to-many.`
        );
      }
    }
  }

  if (rows.length === 0) {
    throw new Error("The join produced no rows — the key columns don't share any values.");
  }

  return { rows, columns: inferColumns(rows), matchedLeftRows };
}
