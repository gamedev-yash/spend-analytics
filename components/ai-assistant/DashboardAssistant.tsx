"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bot, Loader2, Send, Sparkles, Square, X, ArrowRight } from "lucide-react";
import { dashboardKeyForPathname, dashboardMeta, type DashboardKey } from "@/lib/ai/dashboard-registry";
import { cn } from "@/lib/utils";

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  redirect?: { key: DashboardKey; label: string; route: string };
  isError?: boolean;
}

function welcomeFor(key: DashboardKey): string {
  const { label } = dashboardMeta(key);
  return `Hi! I'm grounded in the ${label} dashboard's own data only — ask me about what's on this page. If you need something from another dashboard, I'll point you to it instead of guessing.`;
}

/**
 * Floating chat scoped to exactly one of the four real dashboards — whichever
 * the user is currently on. Unlike AiAssistant (the CSV-upload assistant),
 * this one needs no dataset upload: it's grounded server-side in that
 * dashboard's real, current aggregate data (see lib/ai/dashboard-context.ts).
 * A question that needs a different dashboard's data gets a redirect link,
 * never a guess — renders null outside the four dashboard routes.
 */
export function DashboardAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const dashboardKey = pathname ? dashboardKeyForPathname(pathname) : null;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Reset the conversation when the user moves to a different dashboard —
  // an old exchange grounded in Payment Terms data would be misleading once
  // the assistant is answering for Tail Spend instead.
  useEffect(() => {
    if (dashboardKey) setMessages([{ role: "assistant", content: welcomeFor(dashboardKey) }]);
  }, [dashboardKey]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open]);

  const send = useCallback(
    async (text?: string) => {
      const message = (text ?? input).trim();
      if (!message || busy || !dashboardKey) return;

      const history = messages
        .filter((m) => !m.isError)
        .slice(1)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, { role: "user", content: message }]);
      setInput("");
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/dashboard-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dashboardKey, message, history }),
          signal: controller.signal,
        });
        const data: {
          reply?: string;
          redirect?: { key: DashboardKey; label: string; route: string } | null;
          error?: string;
        } = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply ?? "Done.", redirect: data.redirect ?? undefined },
        ]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setMessages((prev) => [...prev, { role: "assistant", content: "Stopped." }]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: err instanceof Error ? err.message : "Something went wrong talking to the assistant.",
              isError: true,
            },
          ]);
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [input, busy, dashboardKey, messages]
  );

  if (!dashboardKey) return null;
  const meta = dashboardMeta(dashboardKey);

  return (
    <>
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
        <div className="fixed bottom-24 right-6 z-[60] flex h-[min(34rem,calc(100vh-9rem))] w-[min(24rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <p className="flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                AI Assistant
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Grounded only in {meta.label}&apos;s data — no other dashboard.
            </p>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[92%] rounded-lg px-3 py-2 text-sm leading-snug",
                  m.role === "user"
                    ? "ml-auto bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : m.isError
                      ? "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
                      : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                )}
              >
                {m.content}
                {m.redirect && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(m.redirect!.route);
                    }}
                    className="mt-2 flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Go to {m.redirect.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking…
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
              placeholder={`Ask about ${meta.label}…`}
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
        </div>
      )}
    </>
  );
}
