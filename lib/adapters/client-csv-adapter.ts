// The in-memory provider that backs every widget today: PapaParse on the way in
// and a single filter → group → aggregate → sort → limit pass on the way out,
// both of which used to sit inline in DatasetsContext and lib/widget-data.
// Everything client-specific stops here, so pointing the app at a database is a
// matter of constructing a different IDataProvider.

import Papa from "papaparse";
import { inferColumns, toNumber, type ColumnMeta } from "@/lib/infer";
import {
  COUNT_ALL,
  type IDataProvider,
  type QueryFilter,
  type QueryMeasure,
  type QueryPayload,
  type QueryResult,
  type TimeGrain,
} from "@/types/data-provider";
import type { Dataset, DatasetRow } from "@/types/dataset";

export interface ParsedCsv {
  rows: DatasetRow[];
  columns: ColumnMeta[];
}

/**
 * IDataProvider over datasets already parsed into JavaScript arrays. Rows are
 * read through the getter handed to the constructor rather than captured, so the
 * adapter always sees the live store without importing it (and without a cycle).
 */
export class ClientCsvAdapter implements IDataProvider {
  readonly id = "client-csv";

  private readonly readDatasets: () => Dataset[];

  constructor(readDatasets: () => Dataset[]) {
    this.readDatasets = readDatasets;
  }

  async getDatasets(): Promise<Dataset[]> {
    return this.readDatasets();
  }

  async getDatasetMetadata(datasetId: string): Promise<ColumnMeta[]> {
    return this.requireDataset(datasetId).columns;
  }

  async queryWidgetData(payload: QueryPayload): Promise<QueryResult> {
    const startedAt = performance.now();
    const dataset = this.requireDataset(payload.datasetId);
    const matching = filterRows(dataset.rows, payload.filters ?? []);
    const rows = aggregateRows(dataset, matching, payload);
    return {
      rows,
      totalMatchingRows: matching.length,
      executionTimeMs: performance.now() - startedAt,
    };
  }

  /**
   * Parse an uploaded CSV and infer its column types. Not part of
   * IDataProvider — only a file-backed provider ingests files — but it keeps the
   * whole client-side CSV engine in one place.
   */
  async parseCsv(file: File): Promise<ParsedCsv> {
    const rows = await parseCsvFile(file);
    return { rows, columns: inferColumns(rows) };
  }

  private requireDataset(datasetId: string): Dataset {
    const dataset = this.readDatasets().find((d) => d.id === datasetId);
    if (!dataset) throw new Error(`Dataset "${datasetId}" is no longer loaded in this browser.`);
    return dataset;
  }
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function parseCsvFile(file: File): Promise<DatasetRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<DatasetRow>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const fatal = result.errors.find(
          (e) => e.type === "Delimiter" || e.code === "UndetectableDelimiter"
        );
        if (fatal) {
          reject(new Error(`Could not parse "${file.name}": ${fatal.message}`));
          return;
        }
        if (result.data.length === 0) {
          reject(new Error(`"${file.name}" contains no data rows.`));
          return;
        }
        resolve(result.data);
      },
      error: (err) => reject(new Error(`Could not read "${file.name}": ${err.message}`)),
    });
  });
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Cells and filter values are compared as trimmed text so " Steel " matches "Steel". */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function filterRows(rows: DatasetRow[], filters: QueryFilter[]): DatasetRow[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((filter) => matchesFilter(row[filter.field], filter)));
}

function matchesFilter(cell: unknown, filter: QueryFilter): boolean {
  switch (filter.operator) {
    case "eq":
      return cellText(cell) === cellText(filter.value);
    case "neq":
      return cellText(cell) !== cellText(filter.value);
    case "in":
      return (
        Array.isArray(filter.value) && filter.value.some((value) => cellText(value) === cellText(cell))
      );
    default:
      return comparesAs(cell, filter.value, filter.operator);
  }
}

/** Ordered comparison: numeric when both sides are numbers, lexicographic otherwise (ISO dates included). */
function comparesAs(
  cell: unknown,
  value: unknown,
  operator: "gt" | "gte" | "lt" | "lte"
): boolean {
  const left = toNumber(cell);
  const right = toNumber(value);
  const diff =
    left !== null && right !== null ? left - right : cellText(cell).localeCompare(cellText(value));
  switch (operator) {
    case "gt":
      return diff > 0;
    case "gte":
      return diff >= 0;
    case "lt":
      return diff < 0;
    case "lte":
      return diff <= 0;
  }
}

// ---------------------------------------------------------------------------
// Grouping and aggregation
// ---------------------------------------------------------------------------

/** "2025-03-14" / "14/03/2025" → "2025-03"; non-dates pass through unchanged. */
function monthBucket(raw: string): string {
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString().slice(0, 7);
}

/**
 * Bucket label for a date cell at the requested grain. Coarser grains build on
 * the month bucket, so anything monthBucket can't parse falls through as-is.
 * Labels match lib/server/query-builder exactly — the same payload has to read
 * the same whichever provider answers it.
 */
function dateBucket(raw: string, grain: TimeGrain): string {
  const month = monthBucket(raw);
  if (grain === "month") return month;
  const parts = /^(\d{4})-(\d{2})$/.exec(month);
  if (!parts) return month;
  const year = Number(parts[1]);
  const monthNumber = Number(parts[2]);
  if (grain === "quarter") return `${year}-Q${Math.ceil(monthNumber / 3)}`;
  // Indian fiscal year, April–March: January–March belong to the year before.
  const fiscalYear = monthNumber >= 4 ? year : year - 1;
  return `FY${fiscalYear}-${String((fiscalYear + 1) % 100).padStart(2, "0")}`;
}

/** Grouping value for one cell: trimmed text (bucketed for dates), or null when empty. */
function dimensionValue(cell: unknown, grain: TimeGrain | null): string | null {
  const text = cellText(cell);
  if (text === "") return null;
  return grain === null ? text : dateBucket(text, grain);
}

interface FieldAccumulator {
  sum: number;
  /** Rows whose cell had a value — SQL's COUNT(column). */
  nonEmpty: number;
  distinct: Set<string>;
}

interface GroupAccumulator {
  /** Dimension values in payload order; emitted verbatim on the result row. */
  key: (string | null)[];
  rowCount: number;
  fields: Map<string, FieldAccumulator>;
}

function accumulateRow(group: GroupAccumulator, row: DatasetRow, fields: string[]): void {
  group.rowCount += 1;
  for (const field of fields) {
    let acc = group.fields.get(field);
    if (!acc) {
      acc = { sum: 0, nonEmpty: 0, distinct: new Set<string>() };
      group.fields.set(field, acc);
    }
    const raw = row[field];
    const numeric = toNumber(raw);
    if (numeric !== null) acc.sum += numeric;
    const text = cellText(raw);
    if (text !== "") {
      acc.nonEmpty += 1;
      acc.distinct.add(text);
    }
  }
}

function finalizeMeasure(group: GroupAccumulator, measure: QueryMeasure): number {
  if (measure.field === COUNT_ALL) {
    if (measure.aggregation !== "count") {
      throw new Error(
        `ClientCsvAdapter: "${measure.aggregation}" needs a column — only "count" accepts "${COUNT_ALL}".`
      );
    }
    return group.rowCount;
  }
  const acc = group.fields.get(measure.field);
  if (!acc) return 0;
  switch (measure.aggregation) {
    case "sum":
      return acc.sum;
    // Averaged over every row in the group, not just the ones carrying a number,
    // so a sparse column reports a per-row average rather than a per-value one.
    case "avg":
      return group.rowCount > 0 ? acc.sum / group.rowCount : 0;
    case "count":
      return acc.nonEmpty;
    case "distinct":
      return acc.distinct.size;
  }
}

function isDateColumn(dataset: Dataset, columnId: string): boolean {
  return dataset.columns.find((c) => c.id === columnId)?.type === "date";
}

/**
 * Ascending order over dimension values. Empty groups (null) sort first, which
 * is both T-SQL's default for `ORDER BY … ASC` and where the "(No value)" label
 * used to land when these were sorted as plain strings.
 */
function compareDimension(a: unknown, b: unknown): number {
  const left = a === null || a === undefined ? null : String(a);
  const right = b === null || b === undefined ? null : String(b);
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left.localeCompare(right);
}

function compareMeasure(a: unknown, b: unknown): number {
  return (toNumber(a) ?? 0) - (toNumber(b) ?? 0);
}

function aggregateRows(
  dataset: Dataset,
  rows: DatasetRow[],
  payload: QueryPayload
): Record<string, unknown>[] {
  const dimensions = payload.dimensions ?? [];
  const measures = payload.measures ?? [];
  // COUNT_ALL is answered by the group's row count, so it needs no accumulator.
  const measureFields = Array.from(
    new Set(measures.map((m) => m.field).filter((field) => field !== COUNT_ALL))
  );
  // null for anything that isn't a date column; date columns bucket at the
  // requested grain, month by default.
  const grain = payload.timeGrain ?? "month";
  const dimensionGrains = dimensions.map((field) => (isDateColumn(dataset, field) ? grain : null));

  const groups = new Map<string, GroupAccumulator>();
  const groupFor = (mapKey: string, key: (string | null)[]): GroupAccumulator => {
    let group = groups.get(mapKey);
    if (!group) {
      group = { key, rowCount: 0, fields: new Map<string, FieldAccumulator>() };
      groups.set(mapKey, group);
    }
    return group;
  };

  // With no dimensions the result is a grand total, which must exist even when
  // nothing matched — a KPI reads 0 rather than going blank.
  if (dimensions.length === 0) groupFor("", []);

  for (const row of rows) {
    if (dimensions.length === 0) {
      accumulateRow(groupFor("", []), row, measureFields);
      continue;
    }
    const key = dimensions.map((field, index) => dimensionValue(row[field], dimensionGrains[index]));
    accumulateRow(groupFor(JSON.stringify(key), key), row, measureFields);
  }

  const result = Array.from(groups.values()).map((group) => {
    const record: Record<string, unknown> = {};
    dimensions.forEach((field, index) => {
      record[field] = group.key[index];
    });
    for (const measure of measures) record[measure.alias] = finalizeMeasure(group, measure);
    return record;
  });

  const { sort, limit } = payload;
  if (sort) {
    const compare = measures.some((m) => m.alias === sort.field) ? compareMeasure : compareDimension;
    const direction = sort.direction === "desc" ? -1 : 1;
    result.sort((a, b) => direction * compare(a[sort.field], b[sort.field]));
  }
  return limit !== undefined && limit > 0 ? result.slice(0, limit) : result;
}
