"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Bot,
  Check,
  Database,
  Loader2,
  Send,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useDatasets, type Dataset } from "@/context/DatasetsContext";
import { addWidget, useCustomDashboards } from "@/lib/custom-dashboards-store";
import {
  askAssistant,
  generatePermutationSuggestions,
  AssistantError,
} from "@/lib/ai/widget-parser";
import {
  CHART_TYPE_LABELS,
  type CustomDashboard,
  type WidgetConfig,
} from "@/types/custom-dashboard";
import { FilterSelect } from "@/components/ui/filter-controls";
import { cn } from "@/lib/utils";

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  /** Widget the assistant produced for this turn, once injected. */
  addedWidget?: string;
  isError?: boolean;
}

const WELCOME =
  "Hi! Ask me anything about your active dataset — row counts, totals, which columns are numeric — or just describe a chart (\"add a donut chart of spend by category\") and I'll build it into your dashboard.";

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
 * Floating AI Assistant. Two tabs: a grounded chat that can also emit widgets,
 * and a grid of locally-computed chart permutations that inject with one
 * click. Both write into whichever custom dashboard is selected below —
 * defaulting to the one you're currently viewing.
 */
export function AiAssistant() {
  const pathname = usePathname();
  const { datasets, getDatasetForPage } = useDatasets();
  const dashboards = useCustomDashboards();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "permutations">("chat");
  const [messages, setMessages] = useState<ChatEntry[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [targetDashboardId, setTargetDashboardId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  // The dashboard being viewed is the natural default target; otherwise the
  // most recently created one.
  const routeDashboardId = pathname?.startsWith("/dashboards/")
    ? pathname.split("/")[2]
    : undefined;
  const activeDashboard: CustomDashboard | null =
    dashboards.find((d) => d.id === targetDashboardId) ??
    dashboards.find((d) => d.id === routeDashboardId) ??
    dashboards[dashboards.length - 1] ??
    null;

  // Dataset context: the bound dataset of the target dashboard, else this
  // page's uploaded dataset, else the newest upload.
  const pageKey = pathname?.split("/")[1] ?? "";
  const dataset: Dataset | null =
    (activeDashboard
      ? datasets.find((d) => d.id === activeDashboard.datasetId) ?? null
      : null) ??
    getDatasetForPage(pageKey) ??
    datasets[datasets.length - 1] ??
    null;

  const permutations = useMemo(
    () => (dataset ? generatePermutationSuggestions(dataset.columns) : []),
    [dataset]
  );

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open, tab]);

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
    try {
      const result = await askAssistant(message, dataset, history);
      let addedWidget: string | undefined;
      if (result.validatedWidget) {
        if (injectWidget(result.validatedWidget)) addedWidget = result.validatedWidget.title;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            result.reply ||
            (addedWidget ? `Added "${addedWidget}".` : "Done."),
          addedWidget,
        },
      ]);
      if (result.validatedWidget && !addedWidget) {
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="AI Assistant"
        className={cn(
          "fixed bottom-6 right-6 z-[60] inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-lg transition-all",
          open
            ? "bg-slate-700 text-white hover:bg-slate-600"
            : "bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        )}
      >
        {open ? <X className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        AI Assistant
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-[60] flex h-[min(38rem,calc(100vh-9rem))] w-[min(26rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          {/* Header */}
          <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <p className="flex-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Procurement BI Assistant
              </p>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Database className="h-3 w-3 shrink-0" />
              {dataset ? (
                <span className="truncate">
                  {dataset.name} · {dataset.rows.length.toLocaleString("en-IN")} rows
                </span>
              ) : (
                <span>No dataset — upload a CSV to ground answers</span>
              )}
            </p>
            {dashboards.length > 0 && (
              <div className="mt-2">
                <FilterSelect
                  label="Add widgets to"
                  value={activeDashboard?.id ?? ""}
                  onChange={setTargetDashboardId}
                  options={dashboards.map((d) => ({ value: d.id, label: d.title }))}
                />
              </div>
            )}
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
                      "max-w-[90%] rounded-lg px-3 py-2 text-sm leading-snug",
                      m.role === "user"
                        ? "ml-auto bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : m.isError
                          ? "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
                          : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                    )}
                  >
                    {m.content}
                    {m.addedWidget && (
                      <span className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3 w-3" />
                        Added &quot;{m.addedWidget}&quot;
                      </span>
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
                  onClick={() => void send()}
                  disabled={busy || !input.trim()}
                  aria-label="Send message"
                  className="rounded-lg bg-slate-900 p-2.5 text-white transition-colors hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
