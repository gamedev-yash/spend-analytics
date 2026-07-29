// The shape of a dataset held by the app. These types are the boundary between
// the data layer (context/DatasetsContext, lib/adapters/*) and every consumer,
// so they live here rather than inside the "use client" context module — an
// adapter that never touches React can import them freely.
//
// context/DatasetsContext re-exports all three, so `import type { Dataset }
// from "@/context/DatasetsContext"` keeps working.

import type { ColumnMeta } from "@/lib/infer";

export type DatasetRow = Record<string, unknown>;

/** How a joined (composite) dataset was produced — kept for provenance/UI badges. */
export interface JoinInfo {
  leftId: string;
  rightId: string;
  leftName: string;
  rightName: string;
  /** Display label — composite keys render as "EBELN + EBELP". */
  leftKey: string;
  rightKey: string;
  joinType: "inner" | "left";
  matchedLeftRows: number;
  /** True when the join was executed automatically by the SAP auto-join engine. */
  auto?: boolean;
}

export interface Dataset {
  id: string;
  /** Original file name ("tail-spend.csv") or user-chosen name for joined datasets. */
  name: string;
  /**
   * Where the rows live. "upload" (the default when absent, so datasets
   * persisted before this field keep working) means a CSV parsed in this
   * browser; "server" means a warehouse table answered over the query API, with
   * `rows` left empty.
   */
  source?: "upload" | "server";
  /** Dashboard route this dataset feeds; undefined = unassigned. */
  pageKey?: string;
  /**
   * Every row, in memory. Only a client-side provider populates this — a
   * server-backed provider leaves it empty and answers through
   * IDataProvider.queryWidgetData instead, so nothing outside an adapter should
   * read rows directly.
   */
  rows: DatasetRow[];
  columns: ColumnMeta[];
  createdAt: string;
  /** True for materialized composite datasets produced by createJoinedDataset. */
  isJoined?: boolean;
  joinInfo?: JoinInfo;
}
