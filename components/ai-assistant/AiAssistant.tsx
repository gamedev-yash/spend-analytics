"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bot,
  Check,
  Database,
  Loader2,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  Square,
  Wand2,
  X,
} from "lucide-react";
import { useDatasets, type Dataset } from "@/context/DatasetsContext";
import { DASHBOARD_REGISTRY } from "@/lib/ai/dashboard-registry";
import { addWidget, useCustomDashboards } from "@/lib/custom-dashboards-store";
import {
  askAssistant,
  generatePermutationSuggestions,
  AssistantError,
} from "@/lib/ai/widget-parser";
import { stashPendingPrompt, takePendingPrompt } from "@/lib/ai/assistant-handoff";
import { useDraggableBubble } from "@/hooks/use-draggable-bubble";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { AssistantMarkdown } from "./AssistantMarkdown";
import type { AssistantQuery, OtherDashboardInfo } from "@/types/assistant";
import {
  CHART_TYPE_LABELS,
  type CustomDashboard,
  type WidgetConfig,
} from "@/types/custom-dashboard";
import { cn } from "@/lib/utils";

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  /** Widget the assistant produced for this turn, once injected. */
  addedWidget?: string;
  /** Set when the assistant redirected instead of answering — renders a "Go to X" link. */
  redirect?: { id: string; title: string; route: string };
  /** Set when the assistant asked a clarifying question — renders clickable choices. */
  options?: string[];
  /**
   * Set when the assistant queried the warehouse for this turn — an
   * experimental "show the query" panel so we can judge whether surfacing
   * query provenance is actually useful before committing to it.
   */
  query?: AssistantQuery | null;
  isError?: boolean;
}

/** One line per payload field the model set, for the "show the query" panel. */
function describeQueryPayload(payload: AssistantQuery["payload"]): string {
  const parts: string[] = [];
  if (payload.dimensions?.length) parts.push(`grouped by ${payload.dimensions.join(", ")}`);
  if (payload.measures?.length) {
    parts.push(payload.measures.map((m) => `${m.aggregation}(${m.field}) as ${m.alias}`).join(", "));
  }
  if (payload.filters?.length) {
    parts.push(`filtered: ${payload.filters.map((f) => `${f.field} ${f.operator} ${JSON.stringify(f.value)}`).join(", ")}`);
  }
  if (payload.timeGrain) parts.push(`by ${payload.timeGrain}`);
  if (payload.sort) parts.push(`sorted ${payload.sort.field} ${payload.sort.direction}`);
  if (payload.limit) parts.push(`limit ${payload.limit}`);
  return parts.length > 0 ? parts.join(" · ") : "no grouping — single total";
}

function queryRowColumns(rows: Record<string, unknown>[]): string[] {
  return rows.length > 0 ? Object.keys(rows[0]) : [];
}

function formatQueryCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString("en-IN");
  return String(value);
}

const BUBBLE_HEIGHT_PX = 48;
const PANEL_GAP_PX = 12;
const PANEL_WIDTH_PX = 416; // matches w-[min(26rem,...)] below

function welcomeFor(dashboardTitle: string): string {
  return `Hi! I'm grounded in "${dashboardTitle}"'s own data only — ask me about what's on this dashboard, or describe a chart to add. If your question belongs to a different dashboard, I'll point you there instead of guessing.`;
}

const STARTERS = [
  "What is the row count and total spend in this dataset?",
  "Which columns are numeric?",
  "Add a bar chart of the top 10 by spend",
];

/** Toast confirming an injected widget. */
function AssistantToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return createPortal(
    <div
      role="status"
      className="fixed bottom-24 right-6 z-[70] flex max-w-sm items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
    >
      <Check className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="leading-snug">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>,
    document.body
  );
}

/**
 * Floating AI Assistant, scoped to exactly one custom dashboard — whichever
 * /dashboards/[id] you're currently viewing, the same isolation model
 * DashboardAssistant uses for the core dashboards. It never reads or
 * writes any other dashboard: a question about data that lives elsewhere
 * gets a redirect link instead of a guess or a cross-dashboard write.
 */
export function AiAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const { datasets } = useDatasets();
  const dashboards = useCustomDashboards();

  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [tab, setTab] = useState<"chat" | "permutations">("chat");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { position, onPointerDown, onPointerMove, onPointerUp, suppressClickAfterDrag } =
    useDraggableBubble();
  const closeOnOutsideClick = useCallback(() => setOpen(false), []);
  useOutsideClick(open, closeOnOutsideClick, [panelRef, buttonRef]);

  function stop() {
    abortRef.current?.abort();
  }

  // Strictly the dashboard whose page this is — no fallback to "newest" and
  // no way to target a different one from here.
  const routeDashboardId = pathname?.startsWith("/dashboards/") ? pathname.split("/")[2] : undefined;
  const activeDashboard: CustomDashboard | null = dashboards.find((d) => d.id === routeDashboardId) ?? null;

  const dataset: Dataset | null = activeDashboard
    ? datasets.find((d) => d.id === activeDashboard.datasetId) ?? null
    : null;

  // Every other dashboard that exists — core pages plus other custom
  // dashboards — named only so the model can redirect there, never to answer
  // from. Their data never enters this request.
  const otherDashboards = useMemo<OtherDashboardInfo[]>(() => {
    const core = DASHBOARD_REGISTRY.map((d) => ({
      id: d.key,
      title: d.label,
      route: d.route,
      summary: d.description,
    }));
    const otherCustom = dashboards
      .filter((d) => d.id !== activeDashboard?.id)
      .map((d) => {
        const bound = datasets.find((x) => x.id === d.datasetId);
        const columns = bound ? bound.columns.map((c) => c.name).join(", ") : "unknown columns";
        return {
          id: d.id,
          title: d.title,
          route: `/dashboards/${d.id}`,
          summary: `Custom dashboard bound to "${bound?.name ?? "a dataset"}" — columns: ${columns}`,
        };
      });
    return [...core, ...otherCustom];
  }, [dashboards, datasets, activeDashboard]);

  const permutations = useMemo(
    () => (dataset ? generatePermutationSuggestions(dataset.columns) : []),
    [dataset]
  );

  // Reset the conversation whenever the dashboard changes — an exchange
  // grounded in one dashboard's data would be misleading once the assistant
  // is answering for a different one. Depends on id/title specifically
  // (not the activeDashboard object) so an unrelated widgets-array change
  // doesn't wipe the conversation.
  useEffect(() => {
    if (!activeDashboard) return;
    setMessages([{ role: "assistant", content: welcomeFor(activeDashboard.title) }]);
    // A redirect from another dashboard's assistant may have handed off the
    // question that got the user sent here — surface it in the input instead
    // of making them retype it, and open the panel so it's visible.
    const pending = takePendingPrompt();
    if (pending) {
      setInput(pending);
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDashboard?.id, activeDashboard?.title]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open, tab]);

  // No dashboard resolved for this route — nothing for this assistant to be
  // grounded in, so it doesn't render at all (matches DashboardAssistant).
  if (!activeDashboard) return null;

  function injectWidget(widget: WidgetConfig): boolean {
    if (!activeDashboard) return false;
    addWidget(activeDashboard.id, widget);
    setToast(`Added "${widget.title}" to ${activeDashboard.title}`);
    return true;
  }

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;

    const history = messages
      .filter((m) => !m.isError)
      .slice(1) // drop the canned welcome
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await askAssistant(message, dataset, history, otherDashboards, controller.signal);
      let addedWidget: string | undefined;
      if (result.validatedWidget && !result.redirect) {
        if (injectWidget(result.validatedWidget)) addedWidget = result.validatedWidget.title;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply || (addedWidget ? `Added "${addedWidget}".` : "Done."),
          addedWidget,
          redirect: result.redirect ?? undefined,
          options: result.options ?? undefined,
          query: result.query ?? undefined,
        },
      ]);
      if (result.validatedWidget && !addedWidget && !result.redirect) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "I built that widget but there's no custom dashboard to put it in — create one from the sidebar first.",
            isError: true,
          },
        ]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) => [...prev, { role: "assistant", content: "Stopped." }]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              err instanceof AssistantError || err instanceof Error
                ? err.message
                : "Something went wrong talking to the assistant.",
            isError: true,
          },
        ]);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  return (
    <>
      {/* Floating action button — draggable; drop position anchors the panel too */}
      <button
        ref={buttonRef}
        type="button"
        onClick={suppressClickAfterDrag(() => setOpen((v) => !v))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-expanded={open}
        aria-label="AI Assistant"
        style={position ? { left: position.x, top: position.y } : undefined}
        className={cn(
          "fixed z-[60] inline-flex touch-none items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-lg transition-colors select-none",
          !position && "bottom-6 right-6",
          open
            ? "bg-slate-700 text-white hover:bg-slate-600"
            : "bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        )}
      >
        {open ? <X className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        AI Assistant
      </button>

      {open && (
        <div
          ref={panelRef}
          style={
            !fullscreen && position
              ? {
                  left: Math.min(
                    position.x,
                    window.innerWidth - Math.min(PANEL_WIDTH_PX, window.innerWidth - 48) - 8
                  ),
                  ...(position.y < window.innerHeight / 2
                    ? { top: position.y + BUBBLE_HEIGHT_PX + PANEL_GAP_PX }
                    : { bottom: window.innerHeight - position.y + PANEL_GAP_PX }),
                }
              : undefined
          }
          className={cn(
            "fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900",
            fullscreen
              ? "inset-4 md:inset-10"
              : cn("h-[min(38rem,calc(100vh-9rem))] w-[min(26rem,calc(100vw-3rem))]", !position && "bottom-24 right-6")
          )}
        >
          {/* Header */}
          <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <p className="flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeDashboard.title}
              </p>
              <button
                type="button"
                onClick={() => setFullscreen((v) => !v)}
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                title={fullscreen ? "Exit full screen" : "Full screen"}
                className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Database className="h-3 w-3 shrink-0" />
              {dataset ? (
                <span className="truncate">
                  Grounded in {dataset.name} · {dataset.rows.length.toLocaleString("en-IN")} rows — no other dashboard
                </span>
              ) : (
                <span>Bound dataset is missing — upload it again to ground answers</span>
              )}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex shrink-0 gap-1 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            {(
              [
                { id: "chat", label: "Chat & Q&A", icon: Bot },
                { id: "permutations", label: "Quick Charts", icon: Wand2 },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === t.id
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Body */}
          {tab === "chat" ? (
            <>
              <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm leading-snug",
                      fullscreen ? "max-w-[70%]" : "max-w-[90%]",
                      m.role === "user"
                        ? "ml-auto whitespace-pre-wrap bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : m.isError
                          ? "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
                          : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                    )}
                  >
                    {m.role === "user" ? m.content : <AssistantMarkdown text={m.content} />}
                    {m.addedWidget && (
                      <span className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3 w-3" />
                        Added &quot;{m.addedWidget}&quot;
                      </span>
                    )}
                    {m.redirect && (
                      <button
                        type="button"
                        onClick={() => {
                          const lastUserMessage = messages.filter((x) => x.role === "user").at(-1)?.content;
                          if (lastUserMessage) stashPendingPrompt(lastUserMessage);
                          setOpen(false);
                          router.push(m.redirect!.route);
                        }}
                        className="mt-2 flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Go to {m.redirect.title}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {m.options && m.options.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.options.map((option) => (
                          <button
                            key={option}
                            type="button"
                            disabled={busy}
                            onClick={() => send(option)}
                            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                    {m.query && (
                      <details className="mt-2 rounded-md border border-slate-200 bg-white/70 p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                        <summary className="cursor-pointer select-none font-medium">
                          Show the query · {m.query.result.rows.length} row
                          {m.query.result.rows.length === 1 ? "" : "s"}
                        </summary>
                        <div className="mt-2 space-y-2">
                          {m.query.error ? (
                            <p className="text-rose-600 dark:text-rose-400">{m.query.error}</p>
                          ) : (
                            <>
                              <p className="text-slate-500 dark:text-slate-400">
                                <span className="font-mono">{m.query.payload.datasetId}</span> —{" "}
                                {describeQueryPayload(m.query.payload)}
                              </p>
                              {m.query.result.rows.length > 0 && (
                                <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
                                  <table className="w-full border-collapse text-left">
                                    <thead>
                                      <tr className="bg-slate-50 dark:bg-slate-900">
                                        {queryRowColumns(m.query.result.rows).map((col) => (
                                          <th key={col} className="whitespace-nowrap px-2 py-1 font-medium">
                                            {col}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {m.query.result.rows.map((row, ri) => (
                                        <tr key={ri} className="border-t border-slate-200 dark:border-slate-800">
                                          {queryRowColumns(m.query!.result.rows).map((col) => (
                                            <td key={col} className="whitespace-nowrap px-2 py-1 font-mono">
                                              {formatQueryCell(row[col])}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                source: {m.query.source}
                                {typeof m.query.result.totalMatchingRows === "number" &&
                                  ` · ${m.query.result.totalMatchingRows.toLocaleString("en-IN")} rows matched before grouping`}
                              </p>
                            </>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking…
                  </div>
                )}
                {messages.length === 1 && (
                  <div className="space-y-1.5 pt-1">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="block w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-xs text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  placeholder="Ask about your data, or describe a chart…"
                  className="min-h-0 flex-1 resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-slate-500"
                />
                <button
                  type="button"
                  onClick={() => (busy ? stop() : void send())}
                  disabled={!busy && !input.trim()}
                  aria-label={busy ? "Stop generating" : "Send message"}
                  className={cn(
                    "rounded-lg p-2.5 text-white transition-colors disabled:opacity-40",
                    busy
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-slate-900 hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                  )}
                >
                  {busy ? <Square className="h-4 w-4 fill-current" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
              {!dataset ? (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Upload a CSV from any dashboard page and smart chart suggestions will appear here.
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Chart permutations derived from {dataset.name}&apos;s columns.
                  </p>
                  {permutations.map((widget) => (
                    <div
                      key={widget.id}
                      className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                    >
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {widget.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {CHART_TYPE_LABELS[widget.chartType]}
                        {widget.xAxisColumn ? ` · grouped by ${widget.xAxisColumn}` : ""}
                        {widget.yAxisColumn ? ` · ${widget.aggregation} of ${widget.yAxisColumn}` : ""}
                      </p>
                      <button
                        type="button"
                        disabled={!activeDashboard}
                        onClick={() => injectWidget({ ...widget, id: `${widget.id}-${Date.now()}` })}
                        title={
                          activeDashboard
                            ? `Add to ${activeDashboard.title}`
                            : "Create a custom dashboard first"
                        }
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Add to Dashboard
                      </button>
                    </div>
                  ))}
                  {!activeDashboard && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Create a custom dashboard from the sidebar to add these.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {toast && <AssistantToast message={toast} onDismiss={dismissToast} />}
    </>
  );
}
