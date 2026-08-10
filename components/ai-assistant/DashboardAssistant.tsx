"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronDown, Sparkles, X } from "lucide-react";
import { dashboardKeyForPathname, dashboardMeta, type DashboardKey } from "@/lib/ai/dashboard-registry";
import { stashPendingPrompt, takePendingPrompt } from "@/lib/ai/assistant-handoff";
import { useDraggableBubble } from "@/hooks/use-draggable-bubble";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { useFullscreen } from "@/components/dashboard/fullscreen-overlay";
import { Skeleton } from "@/components/ui/skeleton";
import { AssistantHeader } from "./AssistantHeader";
import { EmptyState } from "./EmptyState";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import type { Suggestion } from "./SuggestionChips";
import { cn } from "@/lib/utils";

export interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  redirect?: { key: DashboardKey; label: string; route: string };
  /** Set when the assistant asked a clarifying question — renders clickable choices. */
  options?: string[];
  isError?: boolean;
  /** Client-side send/receive time (Date.now()), display-only — never sent to or read from the API. */
  timestamp?: number;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

const BUBBLE_HEIGHT_PX = 48;
const PANEL_GAP_PX = 12;
const PANEL_WIDTH_PX = 384; // matches w-[min(24rem,...)] below

// Generic, dashboard-agnostic follow-ups shown under the latest answer — canned
// prompt text only, sent through the same real `send()` as anything typed by
// hand. Not model-generated, so they never claim capabilities the assistant
// doesn't have. `label` is the terse chip text; `value` is the full question
// actually sent, so a one-word chip still asks the model something unambiguous.
const FOLLOW_UPS: Suggestion[] = [
  { label: "Compare", value: "Compare with last month" },
  { label: "Break down", value: "Break this down by vendor" },
  { label: "Show trend", value: "Show the trend" },
  { label: "Explain", value: "Explain why this changed" },
];

function welcomeFor(key: DashboardKey): string {
  const { label } = dashboardMeta(key);
  return `Hi! I'm grounded in the ${label} dashboard's own data only — ask me about what's on this page. If you need something from another dashboard, I'll point you to it instead of guessing.`;
}

/**
 * Floating chat scoped to exactly one of the dashboards in DASHBOARD_REGISTRY — whichever
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
  const { isFullscreen: fullscreen, setIsFullscreen: setFullscreen } = useFullscreen();
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevMessageCountRef = useRef(0);
  // Separate counter from prevMessageCountRef above — that one belongs to the
  // unread-bubble effect and updates on the same render pass, so reusing it
  // here would always see "already caught up" by the time this effect reads it.
  const prevScrollCountRef = useRef(0);
  // Whether the user was already at the bottom of the transcript the last
  // time they scrolled — read (not state) so scrolling doesn't re-render.
  const stickToBottomRef = useRef(true);
  // Timestamp until which handleScroll should ignore "not at bottom" —
  // covers the brief window a `scrollTo({ behavior: "smooth" })` animation
  // is still in flight, whose own intermediate scroll events would otherwise
  // flip the jump-to-latest button back on right after the click that was
  // meant to dismiss it.
  const suppressJumpButtonUntilRef = useRef(0);

  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { position, onPointerDown, onPointerMove, onPointerUp, suppressClickAfterDrag } =
    useDraggableBubble();
  // Closing always drops fullscreen too — otherwise a closed (invisible) panel
  // could be left with `fullscreen` still true, and useFullscreen's body-
  // scroll-lock effect keys only off that flag, silently locking the whole
  // page's scroll behind a panel the user can no longer see or reach.
  const closePanel = useCallback(() => {
    setOpen(false);
    setFullscreen(false);
  }, [setFullscreen]);
  useOutsideClick(open && !fullscreen, closePanel, [panelRef, buttonRef]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resetConversation = useCallback(() => {
    if (!dashboardKey) return;
    stop();
    setMessages([{ role: "assistant", content: welcomeFor(dashboardKey), timestamp: Date.now() }]);
    setInput("");
    setUnread(false);
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }, [dashboardKey, stop]);

  // Reset the conversation when the user moves to a different dashboard —
  // an old exchange grounded in Payment Terms data would be misleading once
  // the assistant is answering for Tail Spend instead.
  useEffect(() => {
    if (!dashboardKey) return;
    setMessages([{ role: "assistant", content: welcomeFor(dashboardKey), timestamp: Date.now() }]);
    setUnread(false);
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    // A redirect from another dashboard's assistant may have handed off the
    // question that got the user sent here — surface it in the input instead
    // of making them retype it, and open the panel so it's visible.
    const pending = takePendingPrompt();
    if (pending) {
      setInput(pending);
      setOpen(true);
    }
  }, [dashboardKey]);

  // "New insight" indicator on the launcher bubble: purely a UI read of state
  // that already exists (messages + open), not new business logic or
  // persistence. Skips the seeded welcome message (length going 0 → 1) so the
  // bubble doesn't glow on every page load for a canned greeting — only for a
  // real reply that lands while the panel is minimized.
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (open || prevCount === 0 || messages.length <= prevCount) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") setUnread(true);
  }, [messages, open]);

  useEffect(() => {
    if (open) {
      setUnread(false);
      // Reopening is a fresh look at the panel — start stuck to the latest
      // turn rather than wherever the scroll happened to be left last time.
      stickToBottomRef.current = true;
      setShowJumpToLatest(false);
    }
  }, [open]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 80;
    stickToBottomRef.current = atBottom;
    if (Date.now() < suppressJumpButtonUntilRef.current) return;
    // Mirrors the standard "jump to latest" pattern (Slack/Discord-style):
    // visible any time the user has scrolled away from the bottom, not just
    // when a new message happens to land while they're up there — the
    // messages-effect below still covers that case too, for when new content
    // arrives without the user producing a fresh scroll event to react to.
    setShowJumpToLatest(!atBottom);
  }, []);

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Long enough to outlast the smooth-scroll animation's own intermediate
    // scroll events, which would otherwise re-open the button they were
    // just clicked to dismiss.
    suppressJumpButtonUntilRef.current = Date.now() + 600;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    // The empty state (just the seeded welcome message) is an onboarding
    // screen meant to be read top-down — scroll it to the top instead of
    // following the usual "stick to the latest message" behavior, which
    // would otherwise open every fresh conversation already scrolled past
    // the heading and starter prompts.
    if (messages.length === 1) {
      scrollRef.current.scrollTop = 0;
      prevScrollCountRef.current = messages.length;
      return;
    }
    // Only auto-follow new messages if the user was already reading the
    // bottom of the transcript — someone scrolled up to reread an earlier
    // answer shouldn't get yanked back down by the next reply landing.
    if (stickToBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    } else if (messages.length > prevScrollCountRef.current) {
      setShowJumpToLatest(true);
    }
    prevScrollCountRef.current = messages.length;
  }, [messages, busy, open]);

  const send = useCallback(
    async (text?: string) => {
      const message = (text ?? input).trim();
      if (!message || busy || !dashboardKey) return;

      const history = messages
        .filter((m) => !m.isError)
        .slice(1)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, { role: "user", content: message, timestamp: Date.now() }]);
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
          options?: string[] | null;
          error?: string;
        } = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.reply ?? "Done.",
            redirect: data.redirect ?? undefined,
            options: data.options ?? undefined,
            timestamp: Date.now(),
          },
        ]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setMessages((prev) => [...prev, { role: "assistant", content: "Stopped.", timestamp: Date.now() }]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: err instanceof Error ? err.message : "Something went wrong talking to the assistant.",
              isError: true,
              timestamp: Date.now(),
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

  const handleRedirect = useCallback(
    (redirect: NonNullable<ChatEntry["redirect"]>) => {
      const lastUserMessage = messages.filter((x) => x.role === "user").at(-1)?.content;
      if (lastUserMessage) stashPendingPrompt(lastUserMessage);
      closePanel();
      router.push(redirect.route);
    },
    [messages, router, closePanel]
  );

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  // Move focus into the panel when it opens — otherwise a keyboard/screen
  // reader user's focus stays stranded on the launcher button that's now
  // hidden behind the panel. The composer is the natural landing spot either
  // way (empty state or an ongoing conversation).
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Esc closes the compact popup (full-screen's own Esc-to-exit already comes
  // from useFullscreen above). While full-screen, Tab/Shift+Tab wrap inside
  // the panel instead of escaping into the dashboard behind it — a minimal,
  // dependency-free stand-in for a real dialog focus trap.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !fullscreen) {
        closePanel();
        return;
      }
      if (e.key !== "Tab" || !fullscreen || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled")
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, fullscreen, closePanel]);

  if (!dashboardKey) return null;
  const meta = dashboardMeta(dashboardKey);
  const isEmpty = messages.length === 1;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={suppressClickAfterDrag(() => (open ? closePanel() : setOpen(true)))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-expanded={open}
        aria-label={unread ? "AI Assistant — new reply available" : "AI Assistant"}
        title="AI Assistant"
        style={position ? { left: position.x, top: position.y } : undefined}
        className={cn(
          // `fixed` already establishes a positioning context for the absolute
          // unread-dot child below — no separate `relative` needed (and adding
          // one would conflict with `fixed` on the same element).
          "fixed z-[60] inline-flex cursor-grab touch-none items-center gap-1.5 rounded-full px-4 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-900/20 transition-all select-none active:cursor-grabbing hover:shadow-xl hover:shadow-indigo-900/30",
          !position && "bottom-6 right-6",
          // A restrained brand gradient (the "AI" cue popular assistants use)
          // rather than a flat slate fill — still just a color swap on the
          // same button, no new behavior. Slightly dimmed while open so the
          // launcher visually recedes behind the now-focused panel.
          open
            ? "bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 opacity-90 hover:opacity-100"
            : "bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 hover:from-indigo-500 hover:via-violet-500 hover:to-fuchsia-500"
        )}
      >
        {open ? <X className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        AI
        {/* Subtle "new insight" glow — only shown when a reply landed while
            minimized, never as a decorative always-on effect. */}
        {!open && unread && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white" />
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            role="dialog"
            aria-modal={fullscreen}
            aria-label="AI Assistant"
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
              "fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900",
              fullscreen
                ? "inset-4 md:inset-10"
                : cn("h-[min(34rem,calc(100vh-9rem))] w-[min(24rem,calc(100vw-3rem))]", !position && "bottom-24 right-6")
            )}
          >
            <AssistantHeader
              dashboardLabel={meta.label}
              fullscreen={fullscreen}
              onNewChat={resetConversation}
              onToggleFullscreen={() => setFullscreen((v) => !v)}
              onClose={closePanel}
            />

            <div className="relative min-h-0 flex-1">
              <div ref={scrollRef} onScroll={handleScroll} className="ai-scrollbar h-full overflow-y-auto px-4 py-4">
                {isEmpty ? (
                  <EmptyState
                    dashboardLabel={meta.label}
                    welcomeText={messages[0]?.content ?? welcomeFor(dashboardKey)}
                    onSelect={(text) => void send(text)}
                    disabled={busy}
                    fullscreen={fullscreen}
                  />
                ) : (
                  <div className={cn("mx-auto space-y-4", fullscreen && "max-w-3xl")}>
                    {messages.map((m, i) => (
                      <MessageBubble
                        key={i}
                        message={m}
                        fullscreen={fullscreen}
                        busy={busy}
                        onOptionSelect={(option) => void send(option)}
                        onRedirect={handleRedirect}
                        // Never alongside a pending clarifying question (m.options) —
                        // answering that comes first, so "Compare with last month"
                        // showing up next to "PO spend or Invoice value?" would be
                        // a non-sequitur.
                        followUps={
                          i === lastAssistantIndex && !busy && !m.isError && !m.redirect && !m.options?.length
                            ? FOLLOW_UPS
                            : undefined
                        }
                      />
                    ))}
                    {busy && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 pl-9 text-xs text-slate-400 dark:text-slate-500" aria-hidden="true">
                          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                          <span>Analyzing {meta.label} data</span>
                          <span className="flex items-center gap-0.5">
                            <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-current" />
                          </span>
                        </div>
                        {/* Skeleton preview of the response card about to
                            arrive, in the same shape/position a real answer
                            will render — reuses the existing shadcn Skeleton
                            primitive (components/ui/skeleton.tsx) rather than
                            a one-off shimmer. */}
                        <div
                          className="ml-9 max-w-[80%] space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/70"
                          aria-hidden="true"
                        >
                          <Skeleton className="h-3 w-4/5" />
                          <Skeleton className="h-3 w-3/5" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div role="status" aria-live="polite" className="sr-only">
                  {busy ? `Analyzing ${meta.label} data…` : ""}
                </div>
              </div>

              {!isEmpty && showJumpToLatest && (
                <button
                  type="button"
                  onClick={scrollToLatest}
                  className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-md transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  New activity
                </button>
              )}
            </div>

            {/* Prominent full-screen entry point for the compact popup — the
                header's icon-only toggle still exists for quick access, this
                is the more discoverable, labeled version the compact widget
                calls for. Same `setFullscreen` as the header button — no new
                state, just another trigger for it — so the conversation
                already in `messages` carries over untouched. */}
            {!fullscreen && (
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="flex shrink-0 items-center justify-center gap-1.5 border-t border-slate-100 bg-slate-50/80 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                Open full assistant
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}

            <Composer
              value={input}
              onChange={setInput}
              onSubmit={() => void send()}
              onStop={stop}
              busy={busy}
              placeholder={`Ask about ${meta.label}…`}
              fullscreen={fullscreen}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
