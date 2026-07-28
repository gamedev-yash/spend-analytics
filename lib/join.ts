// In-memory relational joins between two uploaded datasets. The output is an
// ordinary rows+columns pair — materialized by DatasetsContext into a normal
// Dataset, so every page adapter works on joined data unchanged.
//
// Join keys may be a single column or a composite (e.g. SAP EBELN + EBELP):
// pass a string or an array of column ids on each side (same length).

import { inferColumns, type ColumnMeta } from "@/lib/infer";
import type { Dataset, DatasetRow } from "@/context/DatasetsContext";

export type JoinType = "inner" | "left";

/** One column id, or an ordered list of ids forming a composite key. */
export type JoinKeys = string | string[];

export interface JoinOutput {
  rows: DatasetRow[];
  columns: ColumnMeta[];
  /** How many left rows found at least one right match (drives the preview). */
  matchedLeftRows: number;
}

/** Safety cap — a many-to-many key explosion aborts instead of freezing the tab. */
const MAX_JOIN_ROWS = 200_000;

/** Separator for composite key parts — control char no CSV value will contain. */
const KEY_PART_SEPARATOR = "";

export function toKeyList(keys: JoinKeys): string[] {
  return Array.isArray(keys) ? keys : [keys];
}

/** "EBELN + EBELP" — display form of a (possibly composite) key. */
export function joinKeysLabel(keys: JoinKeys): string {
  return toKeyList(keys).join(" + ");
}

/**
 * Key parts compare as trimmed strings, and digit-only parts additionally
 * drop leading zeros — SAP ids are zero-padded CHAR fields (LIFNR
 * "0000100153"), while PapaParse's dynamicTyping turns unpadded exports into
 * plain numbers (100153); both normalize to "100153" so either style joins
 * cleanly (the ALPHA-conversion equivalence). A key with any
 * null/undefined/empty part never matches anything.
 */
function joinKeyOf(row: DatasetRow, keyList: string[]): string | null {
  const parts: string[] = [];
  for (const key of keyList) {
    const value = row[key];
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (s === "") return null;
    parts.push(/^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : s);
  }
  return parts.join(KEY_PART_SEPARATOR);
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
function indexRightRows(rows: DatasetRow[], keyList: string[]): Map<string, DatasetRow[]> {
  const index = new Map<string, DatasetRow[]>();
  for (const row of rows) {
    const key = joinKeyOf(row, keyList);
    if (key === null) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(row);
    else index.set(key, [row]);
  }
  return index;
}

function assertKeysExist(dataset: Dataset, keyList: string[], side: "Left" | "Right"): void {
  for (const key of keyList) {
    if (!dataset.columns.some((c) => c.id === key)) {
      throw new Error(`${side} key column "${key}" not found in "${dataset.name}".`);
    }
  }
}

/** Left rows with at least one right match — cheap preview for the join dialog. */
export function countJoinMatches(
  leftDataset: Dataset,
  rightDataset: Dataset,
  leftKey: JoinKeys,
  rightKey: JoinKeys
): { matchedLeftRows: number; leftRows: number } {
  const leftKeys = toKeyList(leftKey);
  const rightKeys = toKeyList(rightKey);
  const rightIndex = new Set<string>();
  for (const row of rightDataset.rows) {
    const key = joinKeyOf(row, rightKeys);
    if (key !== null) rightIndex.add(key);
  }
  let matched = 0;
  for (const row of leftDataset.rows) {
    const key = joinKeyOf(row, leftKeys);
    if (key !== null && rightIndex.has(key)) matched += 1;
  }
  return { matchedLeftRows: matched, leftRows: leftDataset.rows.length };
}

/**
 * Relational join of two datasets on one or more key columns per side.
 *
 * - `inner` keeps only left rows with a right match; `left` keeps every left
 *   row, filling right columns with null when unmatched.
 * - Right key columns are dropped (their values duplicate the left keys); any
 *   other right column whose id collides with a left column id is prefixed
 *   with the right dataset's name ("dim_vendor_created_at").
 * - Output columns are re-inferred over the joined rows via inferColumns().
 */
export function joinDatasets(
  leftDataset: Dataset,
  rightDataset: Dataset,
  leftKey: JoinKeys,
  rightKey: JoinKeys,
  joinType: JoinType
): JoinOutput {
  const leftKeys = toKeyList(leftKey);
  const rightKeys = toKeyList(rightKey);
  if (leftKeys.length === 0 || leftKeys.length !== rightKeys.length) {
    throw new Error("Left and right join keys must pair up one-to-one.");
  }
  assertKeysExist(leftDataset, leftKeys, "Left");
  assertKeysExist(rightDataset, rightKeys, "Right");

  const leftColumnIds = new Set(leftDataset.columns.map((c) => c.id));
  const rightKeySet = new Set(rightKeys);
  const prefix = collisionPrefix(rightDataset.name);
  const rightColumnMap = rightDataset.columns
    .filter((c) => !rightKeySet.has(c.id))
    .map((c) => {
      if (!leftColumnIds.has(c.id)) return { srcId: c.id, outId: c.id };
      let outId = `${prefix}_${c.id}`;
      let n = 2;
      while (leftColumnIds.has(outId)) outId = `${prefix}_${c.id}_${n++}`;
      return { srcId: c.id, outId };
    });

  const rightIndex = indexRightRows(rightDataset.rows, rightKeys);

  const rows: DatasetRow[] = [];
  let matchedLeftRows = 0;
  for (const leftRow of leftDataset.rows) {
    const key = joinKeyOf(leftRow, leftKeys);
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
