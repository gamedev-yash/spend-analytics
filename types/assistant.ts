// Wire types shared by the AI Assistant UI and its API route. Keeping them in
// one place means the client can't drift from what the route validates.

import type { ColumnMeta } from "@/lib/infer";
import type { WidgetConfig } from "@/types/custom-dashboard";

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
  /** "chat" answers questions; "parse" forces a create_widget tool call. */
  mode: "chat" | "parse";
  message: string;
  history?: AssistantChatMessage[];
  dataset?: DatasetContext | null;
}

export interface AssistantResponse {
  /** Assistant prose. Always present, even when a widget was produced. */
  reply: string;
  /** Set when the model called create_widget (no id — the client assigns one). */
  widget?: Omit<WidgetConfig, "id"> | null;
  /** True when the server had no API key and answered from local data only. */
  offline?: boolean;
}

export interface AssistantErrorResponse {
  error: string;
}
