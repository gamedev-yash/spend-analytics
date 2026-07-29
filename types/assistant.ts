// Wire types shared by the AI Assistant UI and its API route. Keeping them in
// one place means the client can't drift from what the route validates.

import type { ColumnMeta } from "@/lib/infer";
import type { WidgetConfig } from "@/types/custom-dashboard";
import type { QueryPayload, QueryResult } from "@/types/data-provider";

/** Per-column summary stats sent alongside ColumnMeta so answers stay grounded. */
export interface ColumnStats {
  id: string;
  min?: number;
  max?: number;
  sum?: number;
  avg?: number;
  /** A few representative values for category columns. */
  sampleValues?: string[];
}

export interface DatasetContext {
  name: string;
  rowCount: number;
  columns: ColumnMeta[];
  stats: ColumnStats[];
}

export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantRequest {
  /** "chat" answers questions; "parse" forces a widget tool call. */
  mode: "chat" | "parse";
  message: string;
  history?: AssistantChatMessage[];
  /** The uploaded CSV in context, when the app is in client-csv mode. */
  dataset?: DatasetContext | null;
  /**
   * Registry dataset the question is about, e.g. "fact_po_items". Set in Azure
   * SQL mode: the route then offers the warehouse tool and grounds its answer in
   * a real query result rather than in summary statistics.
   */
  registryDatasetId?: string | null;
}

/** A query the model composed, executed against the registry, with its rows. */
export interface AssistantQuery {
  payload: QueryPayload;
  result: QueryResult;
  /** "azure-sql" or "sample-csv". */
  source: string;
  /** Set when the payload was rejected or the query failed. */
  error?: string;
}

export interface AssistantResponse {
  /** Assistant prose. Always present, even when a widget was produced. */
  reply: string;
  /** Set when the model called a widget tool (no id — the client assigns one). */
  widget?: Omit<WidgetConfig, "id"> | null;
  /**
   * Set when the model queried the warehouse. The rows are what its prose is
   * grounded in, and the client can render them without re-querying.
   */
  query?: AssistantQuery | null;
  /** True when the server had no API key and answered from local data only. */
  offline?: boolean;
}

export interface AssistantErrorResponse {
  error: string;
}
