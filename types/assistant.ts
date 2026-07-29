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

/** A dashboard the model does NOT have data for — named only so it can redirect there. */
export interface OtherDashboardInfo {
  /** Dashboard-registry key for a core dashboard, or a custom dashboard's id. */
  id: string;
  title: string;
  route: string;
  /** One-line description of what this dashboard covers. */
  summary: string;
}

export interface AssistantRequest {
  /** "chat" answers questions; "parse" forces a create_widget tool call. */
  mode: "chat" | "parse";
  message: string;
  history?: AssistantChatMessage[];
  dataset?: DatasetContext | null;
  /** Other dashboards that exist, for redirecting — never used to answer directly. */
  otherDashboards?: OtherDashboardInfo[];
}

export interface AssistantResponse {
  /** Assistant prose. Always present, even when a widget was produced. */
  reply: string;
  /** Set when the model called create_widget (no id — the client assigns one). */
  widget?: Omit<WidgetConfig, "id"> | null;
  /** Set when the model called redirect_to_dashboard instead of answering. */
  redirect?: { id: string; title: string; route: string } | null;
  /** True when the server had no API key and answered from local data only. */
  offline?: boolean;
}

export interface AssistantErrorResponse {
  error: string;
}
