"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Sparkles, X } from "lucide-react";
import { dashboardMeta, type DashboardKey } from "@/lib/ai/dashboard-registry";
import {
  dashboardContextId,
  parseDashboardContextId,
  resolveDashboardContext,
  type DashboardContext,
} from "@/lib/ai/dashboard-context";
// Throws CustomDashboardSyncError with an already-user-safe message, which
// send()/runAction()'s existing `err.message` branches surface as-is.
import { ensureCustomDashboardSynced } from "@/lib/ai/custom-dashboard-sync";
import { useGeneratedDashboard, useGeneratedDashboardsReady } from "@/lib/generated-dashboard/store";
import { stashPendingPrompt, takePendingPrompt } from "@/lib/ai/assistant-handoff";
import { adoptConversationId, getOrCreateConversationId, resetConversationId } from "@/lib/ai/conversation-id";
import { useDashboardActiveFilterSummary } from "@/context/DashboardActiveFiltersContext";
import { useIsExportCapturing } from "@/context/ExportCaptureContext";
import { useDraggableBubble } from "@/hooks/use-draggable-bubble";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { useFullscreen } from "@/components/dashboard/fullscreen-overlay";
import { Skeleton } from "@/components/ui/skeleton";
import { AssistantHeader } from "./AssistantHeader";
import { EmptyState } from "./EmptyState";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import type { Suggestion } from "./SuggestionChips";
import type { ActionPlanState } from "./ActionPlanCard";
import { dropActionRun, writeActionPlan } from "./action-run-state";
import { assistantActionsFor, type AssistantActionDefinition } from "@/lib/ai/actions/assistant-actions";
import type { AssistantActionResponse } from "@/lib/ai/actions/action-plan-types";
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
  /**
   * Set only on the entry created by clicking an assistant action — carries
   * the report's progress/result. A normal chat turn never has this, so the
   * action feature adds nothing to the normal message path.
   */
  actionPlan?: ActionPlanState;
  /**
   * Identifies THIS action run, so its progress card can be found again after it
   * has already been rewritten once. Object identity cannot do that job (an
   * immutable update replaces the object) and an index goes stale when a chat
   * turn lands mid-generation. Only ever set alongside `actionPlan`.
   */
  actionRunId?: string;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

// How long the card stays in its "finishing" state — steps walking out — before
// the result is revealed. Replaces a flat minimum-duration floor, which made an
// instant cached result wait but did nothing about the steps themselves: they
// had either all ticked long ago or barely started. Handing the card an explicit
// finishing signal instead lets it complete the sequence it was mid-way through,
// whether the response took 13ms or three minutes. Covers ActionPlanCard's own
// walk-out (8 steps at 120ms) with a little air.
const REPORT_FINISH_MS = 1_150;

// Monotonic per-tab counter for action-run ids. A counter rather than a
// timestamp or a random value: the id only has to be unique within one
// transcript, and this is the one form that cannot collide when two runs start
// in the same millisecond.
let actionRunSeq = 0;

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

function welcomeFor(label: string, kind: DashboardContext["type"]): string {
  return kind === "custom"
    ? `Hi! I'm grounded in the ${label} dashboard's own data only — the records it was generated from, nothing else. Ask me anything those columns can answer; if something isn't in this data, I'll say so rather than guess.`
    : `Hi! I'm grounded in the ${label} dashboard's own data only — ask me about what's on this page. If you need something from another dashboard, I'll point you to it instead of guessing.`;
}

/** Shown in place of the composer when a generated dashboard's record isn't in this browser (a link opened elsewhere, or site data cleared). */
const CUSTOM_DASHBOARD_MISSING_MESSAGE =
  "I can't find this dashboard's data in this browser, so there's nothing for me to answer from. Generated dashboards are stored locally — a link opened in another browser, or after clearing site data, won't resolve. Open a dashboard from the list on the home page and I'll pick it up there.";

interface DashboardAssistantProps {
  /**
   * Renders as a full-page standalone view (app/assistant/page.tsx) instead
   * of the dashboard-embedded floating bubble+panel: no launcher bubble, no
   * drag position, no outside-click-to-close, and the panel fills the
   * viewport edge-to-edge rather than floating over dashboard content.
   */
  standalone?: boolean;
  /** Only consulted when `standalone` is true — the standalone page has no dashboard pathname to infer from, so the context is passed in explicitly instead (see app/assistant/page.tsx's `?dashboard=` search param). */
  standaloneContext?: DashboardContext | null;
}

/**
 * Floating chat scoped to exactly one of the dashboards in DASHBOARD_REGISTRY — whichever
 * the user is currently on. Unlike AiAssistant (the CSV-upload assistant),
 * this one needs no dataset upload: it's grounded server-side in that
 * dashboard's own real data (see lib/ai/dashboard-data-context.ts).
 * A question that needs a different dashboard's data gets a redirect link,
 * never a guess — renders null outside a dashboard route.
 *
 * "One of the dashboards" now means either kind: a built-in dashboard from
 * DASHBOARD_REGISTRY, or a generated dashboard at /generated/<id>. The component
 * is the same in both cases — same launcher, panel, Report Mode, transcript and
 * download UI — because the only thing that differs is the DashboardContext it
 * sends to the API (see lib/ai/dashboard-context.ts). The one piece of extra
 * work a generated dashboard needs is registering its rows with the server the
 * first time they are used, since they live in this browser and nowhere else
 * (lib/ai/custom-dashboard-sync.ts).
 */
export function DashboardAssistant({ standalone = false, standaloneContext = null }: DashboardAssistantProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  // THE resolver, used in exactly one place. A null here means "not on a
  // dashboard" (the home page, this app's other routes) — no longer "this is a
  // generated dashboard and I have no way to name it", which is what used to
  // make the assistant vanish on /generated/<id>.
  const resolvedContext = standalone ? standaloneContext : pathname ? resolveDashboardContext(pathname) : null;
  const contextKey = resolvedContext ? dashboardContextId(resolvedContext) : null;
  // Round-tripped through its own id so the OBJECT identity is stable for as
  // long as the dashboard is. Every callback below depends on it, and a fresh
  // literal on each render (which is what a resolver returns) would rebuild all
  // of them on every keystroke.
  const dashboardContext = useMemo(() => (contextKey ? parseDashboardContextId(contextKey) : null), [contextKey]);

  // Hooks must run unconditionally, so the store is always read — with an id
  // that matches nothing when the current dashboard is a built-in one.
  const customDashboardId = dashboardContext?.type === "custom" ? dashboardContext.dashboardId : "";
  const customDashboard = useGeneratedDashboard(customDashboardId);
  const generatedStoreReady = useGeneratedDashboardsReady();

  // A generated dashboard whose record genuinely isn't in this browser. Only
  // meaningful once the store has hydrated, otherwise every first paint would
  // flash the missing state.
  const customDashboardMissing =
    dashboardContext?.type === "custom" && generatedStoreReady && customDashboard === null;

  const dashboardLabel =
    dashboardContext === null
      ? ""
      : dashboardContext.type === "builtin"
        ? dashboardMeta(dashboardContext.dashboardKey).label
        : (customDashboard?.title ?? "this dashboard");

  const welcomeText = useMemo(
    () =>
      dashboardContext === null
        ? ""
        : customDashboardMissing
          ? CUSTOM_DASHBOARD_MISSING_MESSAGE
          : welcomeFor(dashboardLabel, dashboardContext.type),
    [dashboardContext, dashboardLabel, customDashboardMissing]
  );
  // Read (not depended on) by the navigation-reset effect below, which must not
  // re-run when only the greeting text changes.
  const welcomeTextRef = useRef(welcomeText);
  welcomeTextRef.current = welcomeText;

  // Published by whichever dashboard is currently mounted — see
  // context/DashboardActiveFiltersContext.tsx for why the assistant needs
  // this at all (it lives outside every dashboard page's own filter state).
  const activeFilterSummary = useDashboardActiveFilterSummary();
  // Declarative floating-UI hiding for dashboard exports (see
  // ExportSnapshotModal.tsx's handleExport / lib/export/snapshot-exporter.ts):
  // rendering null here — rather than an imperative DOM style mutation from
  // the exporter — means React itself guarantees the button (and any open
  // panel) comes back exactly as it was the instant capture ends, since the
  // component's own hooks/state never unmount in between.
  const isCapturing = useIsExportCapturing();

  // One id per browser tab session, deliberately NOT reset on dashboard
  // navigation — see lib/ai/conversation-id.ts for why that's required for
  // cross-dashboard follow-up continuation. Only "New chat" (resetConversation
  // below) rotates it.
  const [conversationId, setConversationId] = useState(() => getOrCreateConversationId());
  // From the last response's structured conversation memory
  // (lib/ai/conversation-context.ts) — null until the first answer that
  // actually remembers something. Reset alongside the messages themselves so
  // stale memory from a previous dashboard's visible transcript never lingers
  // in this indicator after a reset/navigation.
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<string[] | null>(null);
  const [contextSummary, setContextSummary] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const { isFullscreen: fullscreen, setIsFullscreen: setFullscreen } = useFullscreen();
  // The standalone page has no launcher bubble to open from, so `open` itself
  // never becomes true there — every effect/render decision that means "is
  // the panel actually showing" reads `panelOpen`, not raw `open`, for
  // exactly that reason. Likewise `effectiveFullscreen`: the standalone page
  // always reads as "fullscreen" (wider message column, Composer's fullscreen
  // toolbar slot for Report Mode) even though it has no toggle state of its own.
  const panelOpen = standalone || open;
  const effectiveFullscreen = standalone || fullscreen;
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Deliberately separate from `busy`: a running report must not disable the
  // composer. The two requests are independent, so the user can turn Report
  // off and keep asking normal questions while one renders.
  const [actionBusy, setActionBusy] = useState(false);
  // Report mode — TURN-BASED: it survives a clarification (where it still has
  // work to do) but switches itself off once a report is delivered, or once a
  // request turns out to be factual/navigational and gets routed to normal chat.
  // At ~160s and a full Claude session per run, a mode that silently stayed on
  // after succeeding would make the next stray message expensive, and the user
  // has already got what they enabled it for. While OFF, nothing about the chat
  // path changes at all: same request, same tools, same latency.
  const [reportMode, setReportMode] = useState(false);
  const [unread, setUnread] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The report workflow gets its own controller rather than sharing `abortRef`:
  // a live generation can run for minutes, and Stop needs to cancel whichever
  // request is actually in flight without one path clobbering the other's
  // controller.
  const actionAbortRef = useRef<AbortController | null>(null);
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
  useOutsideClick(!standalone && open && !fullscreen, closePanel, [panelRef, buttonRef]);

  // "Open in New Tab" — deliberately `noopener`: without it, a same-origin
  // `window.open` clones this tab's sessionStorage into the new one, which
  // would hand the "fresh chat session" a conversationId (and thus server-side
  // memory) it was never supposed to have. See lib/ai/conversation-id.ts.
  const openInNewTab = useCallback(() => {
    if (!contextKey) return;
    // The context id, not a bare dashboard key — it names either kind, and the
    // standalone page parses it back with parseDashboardContextId.
    window.open(`/assistant?dashboard=${encodeURIComponent(contextKey)}`, "_blank", "noopener,noreferrer");
  }, [contextKey]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    actionAbortRef.current?.abort();
  }, []);

  // Set for the duration of a reset so send()'s AbortError branch knows NOT
  // to append its usual "Stopped." message. Without this: New Chat mid-stream
  // calls stop() below, which aborts the in-flight fetch, but that abort's
  // catch handler doesn't run until a later microtask — by then
  // resetConversation has already replaced `messages` with the fresh welcome
  // array, so the late "Stopped." would land appended onto the just-reset
  // transcript instead of vanishing with it. Cleared via setTimeout(0) (a
  // macrotask) rather than a microtask, so it reliably outlasts however many
  // promise-chain hops the abort takes to actually reach that catch block.
  const resettingRef = useRef(false);

  // "New chat" — an explicit reset, per the follow-up feature's reset rules
  // (§20): rotates the conversationId too, so the server's stored memory for
  // the old one is simply never looked up again rather than silently leaking
  // into what looks like a brand-new conversation.
  const resetConversation = useCallback(() => {
    if (!dashboardContext) return;
    resettingRef.current = true;
    stop();
    setBusy(false);
    setConversationId(resetConversationId());
    setSuggestedFollowUps(null);
    setContextSummary(null);
    setReportMode(false);
    setMessages([{ role: "assistant", content: welcomeText, timestamp: Date.now() }]);
    setInput("");
    // An in-flight report's own fetch isn't aborted here (it holds no
    // AbortController — it never blocks the composer, so there is nothing for
    // "Stop" to cancel); clearing the flag just re-enables the action row for
    // the new conversation. Its patch() targets a message object that no
    // longer exists in state, so the stale response lands nowhere.
    setActionBusy(false);
    setUnread(false);
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    // Same landing spot the panel-open effect focuses — New Chat should feel
    // as ready-to-type as first opening it.
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
    setTimeout(() => {
      resettingRef.current = false;
    }, 0);
  }, [dashboardContext, welcomeText, stop]);

  // Reset the VISIBLE conversation when the user moves to a different
  // dashboard — an old exchange grounded in Payment Terms data would be
  // misleading once the assistant is answering for Tail Spend instead.
  // conversationId deliberately does NOT reset here (see its declaration
  // above) — cross-dashboard entity memory (§12) needs it to survive this.
  useEffect(() => {
    if (!contextKey) return;
    setMessages([{ role: "assistant", content: welcomeTextRef.current, timestamp: Date.now() }]);
    setSuggestedFollowUps(null);
    setContextSummary(null);
    setActionBusy(false);
    // Report mode deliberately SURVIVES navigation. Nothing turns it off except
    // the toggle itself and an explicit "New chat" — see the note beside its
    // useState declaration.
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
    // Keyed on the CONTEXT id, so moving between two generated dashboards resets
    // the visible transcript exactly as moving between two built-in ones does.
    // Deliberately not on welcomeText: a generated dashboard's title arrives
    // from the local store a beat after the first paint, and re-running this on
    // that would wipe a conversation already in progress. The small effect below
    // patches the greeting instead.
  }, [contextKey]);

  // Greeting-only refresh: replaces the seeded welcome once a generated
  // dashboard's own title is known (or after a rename), and does nothing at all
  // once the user has actually said something.
  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].role === "assistant" && prev[0].content !== welcomeText
        ? [{ ...prev[0], content: welcomeText }]
        : prev
    );
  }, [welcomeText]);

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

  // Keeps the transcript pinned to the latest message as the composer below
  // it grows (Composer.tsx's auto-resizing textarea) or the window resizes —
  // either one shrinks this flex-1 container's own height, which is exactly
  // what ResizeObserver reports, regardless of which caused it. Only acts
  // when the user was already at the bottom, same rule as every other
  // scroll-follow behavior here.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
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

  /**
   * The ONE place either request is actually sent, for both dashboard kinds.
   *
   * Everything kind-specific about talking to the server lives here and nowhere
   * else: the DashboardContext goes on every request, and a generated dashboard's
   * rows are registered with the server first (once — see
   * lib/ai/custom-dashboard-sync.ts). A 409 + needsDashboardSync means this
   * process lost the snapshot (restart, eviction, a different server instance),
   * so it re-registers and retries exactly once rather than surfacing an error
   * the user can do nothing about. A built-in dashboard skips all of it.
   */
  const postToAssistantApi = useCallback(
    async <T,>(url: string, payload: Record<string, unknown>, signal: AbortSignal): Promise<{ res: Response; data: T }> => {
      if (!dashboardContext) throw new Error("No dashboard is open.");
      const isCustom = dashboardContext.type === "custom";
      if (isCustom && !customDashboard) throw new Error(CUSTOM_DASHBOARD_MISSING_MESSAGE);

      const body = JSON.stringify({ ...payload, dashboard: dashboardContext });
      const post = async () => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal,
        });
        const data = (await res.json().catch(() => ({}))) as T & { needsDashboardSync?: boolean };
        return { res, data };
      };

      if (isCustom && customDashboard) await ensureCustomDashboardSynced(customDashboard, { signal });
      const first = await post();
      if (first.res.ok || !first.data.needsDashboardSync || !isCustom || !customDashboard) return first;

      await ensureCustomDashboardSynced(customDashboard, { force: true, signal });
      return post();
    },
    [dashboardContext, customDashboard]
  );

  const send = useCallback(
    async (text?: string) => {
      const message = (text ?? input).trim();
      if (!message || busy || !dashboardContext) return;

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
        const { res, data } = await postToAssistantApi<{
          reply?: string;
          redirect?: { key: DashboardKey; label: string; route: string } | null;
          options?: string[] | null;
          conversationId?: string;
          suggestedFollowUps?: string[] | null;
          contextSummary?: string | null;
          error?: string;
        }>(
          "/api/dashboard-chat",
          { message, history, activeFilters: activeFilterSummary, conversationId },
          controller.signal
        );
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
        // The server only ever changes this when the id it received was
        // missing/malformed (see sanitizeConversationId) — adopt its
        // replacement so the next message stays consistent with whatever it
        // actually stored memory under.
        if (data.conversationId && data.conversationId !== conversationId) {
          setConversationId(data.conversationId);
          adoptConversationId(data.conversationId);
        }
        setSuggestedFollowUps(data.suggestedFollowUps ?? null);
        setContextSummary(data.contextSummary ?? null);
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
          // A New Chat reset aborts this same request (see resetConversation) —
          // in that case `messages` has already moved on to the fresh welcome
          // array, so this stale "Stopped." has nothing meaningful to append to.
          if (!resettingRef.current) {
            setMessages((prev) => [...prev, { role: "assistant", content: "Stopped.", timestamp: Date.now() }]);
          }
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
    [input, busy, dashboardContext, messages, activeFilterSummary, conversationId, postToAssistantApi]
  );

  /**
   * Runs a report action. The objective is whatever the user just typed with
   * Report mode on — they never re-enter or rephrase a question for it, which
   * is the whole reason the trigger is a mode on the composer rather than a
   * button hanging off a previous answer.
   *
   * Note what is NOT sent: no query results, no transcript. The server reads
   * the relevant previous query straight out of the existing conversation
   * memory it already keeps under this conversationId — smaller over the wire,
   * and impossible for a client to forge.
   */
  const runAction = useCallback(
    async (action: AssistantActionDefinition, objective: string) => {
      if (!dashboardContext || actionBusy) return;

      // Found again by a STABLE ID, not by object identity — see
      // ./action-run-state.ts for what identity matching broke and why the
      // reveal's two consecutive writes are the case that exposed it.
      const runId = `action-run-${(actionRunSeq += 1)}`;
      const entry: ChatEntry = {
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        actionRunId: runId,
        actionPlan: { status: "running", label: action.label, estimatedSeconds: action.estimatedSeconds },
      };
      const write = (actionPlan: ActionPlanState) =>
        setMessages((prev) => writeActionPlan(prev, runId, actionPlan));

      /**
       * Reveal in two beats: tell the card the response has landed so it runs any
       * remaining steps out, wait for that, then show the result. Applies equally
       * to a 13ms cache hit and a three-minute generation — in both cases the
       * step sequence is seen to finish rather than being abandoned part-way.
       */
      const patch = async (actionPlan: ActionPlanState) => {
        write({ status: "running", label: action.label, estimatedSeconds: action.estimatedSeconds, finishing: true });
        await new Promise((resolve) => setTimeout(resolve, REPORT_FINISH_MS));
        write(actionPlan);
      };

      // The typed message still appears as a user turn — the transcript should
      // show what was asked even though the answer is a file rather than prose.
      setMessages((prev) => [
        ...prev,
        { role: "user", content: objective, timestamp: Date.now() },
        entry,
      ]);
      setActionBusy(true);
      const controller = new AbortController();
      actionAbortRef.current = controller;
      try {
        const { res, data } = await postToAssistantApi<AssistantActionResponse>(
          "/api/assistant-actions",
          {
            action: action.id,
            objective,
            activeFilters: activeFilterSummary,
            conversationId,
          },
          controller.signal
        );
        // `data.error` can be missing — an unparseable/empty body leaves `data`
        // as {}. Before this fallback that produced `new Error(undefined)`, i.e.
        // a failed report card carrying an EMPTY message, which is
        // indistinguishable from the generation silently going nowhere. A report
        // that fails must always say something.
        if (!res.ok || !data.success) {
          throw new Error(
            (data.success ? undefined : data.error) || `The report request failed (${res.status}).`
          );
        }

        // Triage decided this request should not become a report. Each kind is
        // routed to the mechanism that ALREADY handles it, rather than to a new
        // report-shaped surface:
        //
        //   factual / navigation  → drop the report card and re-send the very
        //     same question through normal chat. The chat path already answers
        //     figures correctly and already owns redirect_to_dashboard, so
        //     "Report Mode was on" costs the user nothing but a short detour —
        //     they still get a real grounded answer to what they actually asked.
        //   clarification → render the engine's question with the existing
        //     option-chip mechanism, and LEAVE Report Mode on, so whichever
        //     angle they pick flows straight into a report.
        //   unsupported → state the limitation. No chips: there is nothing to
        //     pick, and offering choices would imply the data exists.
        if (data.type === "no_report") {
          const routeToChat = data.kind === "factual" || data.kind === "navigation";
          setMessages((prev) =>
            // Remove the running card — no report is coming, and leaving a spent
            // progress card above the answer reads as a failure.
            dropActionRun(prev, runId)
              .concat(
                routeToChat
                  ? []
                  : [
                      {
                        role: "assistant" as const,
                        content: data.message,
                        options: data.options ?? undefined,
                        timestamp: Date.now(),
                      },
                    ]
              )
          );
          // Report Mode is NOT switched off here: routing one factual question
          // to chat is no reason to discard the user's stated intent for the next.
          if (routeToChat) void send(objective);
          return;
        }

        await patch({
          status: "done",
          label: action.label,
          estimatedSeconds: action.estimatedSeconds,
          report: data.report,
          artifacts: data.artifacts,
          cached: data.cached,
        });
      } catch (err) {
        // An abort is the one case that skips the floor — the user asked for it
        // to stop, so making them watch two more seconds of fake progress first
        // would be the opposite of responsive.
        const aborted = err instanceof DOMException && err.name === "AbortError";
        const failure: ActionPlanState = {
          status: "error",
          label: action.label,
          estimatedSeconds: action.estimatedSeconds,
          error: aborted
            ? "Stopped before the report finished."
            : err instanceof Error
              ? err.message
              : "Something went wrong generating that report.",
        };
        if (aborted) write(failure);
        else await patch(failure);
      } finally {
        actionAbortRef.current = null;
        setActionBusy(false);
      }
    },
    [dashboardContext, actionBusy, activeFilterSummary, conversationId, send, postToAssistantApi]
  );

  // Which action Report mode runs. Registry-driven, so this component never
  // names a specific action; a dashboard with none simply hides the toggle.
  const reportAction = useMemo(
    () => (dashboardContext && !customDashboardMissing ? (assistantActionsFor(dashboardContext)[0] ?? null) : null),
    [dashboardContext, customDashboardMissing]
  );

  /**
   * The empty state's "Generate report" card. Arms the mode and moves the cursor
   * into the composer — it deliberately does NOT start a generation, because at
   * the empty state there is no objective to generate against.
   *
   * Routed through the same setReportMode as the composer's own toggle, so the
   * two controls can never disagree about the mode's state.
   */
  const enableReportMode = useCallback(() => {
    setReportMode(true);
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
  }, []);

  /**
   * The composer's submit handler, and the ONE place the mode is read. Chat
   * suggestion chips, clarifying options, and empty-state starters deliberately
   * still call send() directly — clicking "Compare with last month" should
   * never kick off a report just because the toggle happens to be on.
   */
  const submitComposer = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    if (reportMode && reportAction) {
      if (actionBusy) return;
      setInput("");
      void runAction(reportAction, text);
      return;
    }
    void send();
  }, [input, reportMode, reportAction, actionBusy, runAction, send]);

  const handleRedirect = useCallback(
    (redirect: NonNullable<ChatEntry["redirect"]>) => {
      const lastUserMessage = messages.filter((x) => x.role === "user").at(-1)?.content;
      if (lastUserMessage) stashPendingPrompt(lastUserMessage);
      closePanel();
      router.push(redirect.route);
    },
    [messages, router, closePanel]
  );

  // Skips report cards: those are an action's OUTPUT, not an answer, so
  // follow-up chips and the action row both belong on the last real reply
  // above them rather than hanging off a downloaded document.
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant" && !messages[i].actionPlan) return i;
    }
    return -1;
  }, [messages]);

  // Prefer the server's context-derived suggestions (lib/ai/conversation-context.ts's
  // suggestFollowUps — built from what was actually just queried, e.g. "Show
  // top 10" after a top-5 answer) over the generic static chips, so long as
  // it actually returned any; falls back to FOLLOW_UPS otherwise, same as
  // before this feature existed.
  const activeFollowUps: Suggestion[] = useMemo(
    () => (suggestedFollowUps && suggestedFollowUps.length > 0 ? suggestedFollowUps.map((s) => ({ label: s })) : FOLLOW_UPS),
    [suggestedFollowUps]
  );

  // Move focus into the panel when it opens — otherwise a keyboard/screen
  // reader user's focus stays stranded on the launcher button that's now
  // hidden behind the panel. The composer is the natural landing spot either
  // way (empty state or an ongoing conversation).
  useEffect(() => {
    if (!panelOpen) return;
    const id = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [panelOpen]);

  // Esc closes the compact popup (full-screen's own Esc-to-exit already comes
  // from useFullscreen above). While full-screen, Tab/Shift+Tab wrap inside
  // the panel instead of escaping into the dashboard behind it — a minimal,
  // dependency-free stand-in for a real dialog focus trap.
  useEffect(() => {
    if (!panelOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !effectiveFullscreen) {
        closePanel();
        return;
      }
      if (e.key !== "Tab" || !effectiveFullscreen || !panelRef.current) return;
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
  }, [panelOpen, effectiveFullscreen, closePanel]);

  if (!dashboardContext) return null;
  if (isCapturing) return null;
  // A generated dashboard whose local record hasn't been read yet — one paint at
  // most (the store reads localStorage synchronously). Rendering nothing rather
  // than a launcher labelled "this dashboard" avoids a visible flicker on every
  // page load.
  if (dashboardContext.type === "custom" && !generatedStoreReady) return null;
  const isEmpty = messages.length === 1;

  return (
    <>
      {!standalone && (
        <button
          id="ai-assistant-button"
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
            "fixed z-[60] inline-flex cursor-grab touch-none items-center gap-1.5 rounded-full border px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200 select-none active:cursor-grabbing hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
            !position && "bottom-6 right-6",
            // Dark Navy in light mode, Off-White in dark mode — the enterprise
            // high-contrast pair, not a brand gradient. Slightly dimmed while
            // open so the launcher visually recedes behind the now-focused panel.
            "border-slate-800 bg-slate-900 text-white hover:bg-slate-800 dark:border-transparent dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white",
            open && "opacity-90 hover:opacity-100"
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
      )}

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            ref={panelRef}
            data-assistant-panel
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            role={standalone ? undefined : "dialog"}
            aria-modal={standalone ? undefined : fullscreen}
            aria-label="AI Assistant"
            style={
              !standalone && !fullscreen && position
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
              "fixed z-[60] flex flex-col overflow-hidden bg-white dark:bg-slate-900",
              standalone
                ? "inset-0"
                : cn(
                    "rounded-2xl border border-slate-200 shadow-2xl dark:border-slate-800",
                    fullscreen
                      ? "inset-4 md:inset-10"
                      : cn("h-[min(34rem,calc(100vh-9rem))] w-[min(24rem,calc(100vw-3rem))]", !position && "bottom-24 right-6")
                  )
            )}
          >
            <AssistantHeader
              dashboardLabel={dashboardLabel}
              fullscreen={effectiveFullscreen}
              onNewChat={resetConversation}
              onToggleFullscreen={standalone ? undefined : () => setFullscreen((v) => !v)}
              onMinimize={standalone ? undefined : closePanel}
              onOpenInNewTab={standalone ? undefined : openInNewTab}
            />

            <div className="relative min-h-0 flex-1">
              <div ref={scrollRef} onScroll={handleScroll} className="ai-scrollbar h-full overflow-y-auto px-4 py-4">
                {isEmpty ? (
                  <EmptyState
                    dashboardLabel={dashboardLabel}
                    dashboardKind={dashboardContext.type}
                    welcomeText={messages[0]?.content ?? welcomeText}
                    onSelect={(text) => void send(text)}
                    disabled={busy || customDashboardMissing}
                    fullscreen={effectiveFullscreen}
                    // Undefined when this dashboard has no report action, which
                    // is what hides the card rather than showing a dead one.
                    onEnableReportMode={reportAction ? enableReportMode : undefined}
                    reportMode={reportMode}
                  />
                ) : (
                  <div className={cn("mx-auto space-y-4", effectiveFullscreen && "max-w-3xl")}>
                    {messages.map((m, i) => (
                      <MessageBubble
                        key={i}
                        message={m}
                        fullscreen={effectiveFullscreen}
                        busy={busy}
                        onOptionSelect={(option) => void send(option)}
                        onRedirect={handleRedirect}
                        // Never alongside a pending clarifying question (m.options) —
                        // answering that comes first, so "Compare with last month"
                        // showing up next to "PO spend or Invoice value?" would be
                        // a non-sequitur.
                        followUps={
                          i === lastAssistantIndex && !busy && !m.isError && !m.redirect && !m.options?.length
                            ? activeFollowUps
                            : undefined
                        }
                      />
                    ))}
                    {busy && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 pl-9 text-xs text-slate-400 dark:text-slate-500" aria-hidden="true">
                          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                          <span>Analyzing {dashboardLabel} data</span>
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
                  {busy ? `Analyzing ${dashboardLabel} data…` : ""}
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

            {/* Transparency, not decoration: the answer about to come back is
                grounded in this filtered view, not the full dataset — the
                user should see that before asking, not have to infer it from
                a number that doesn't match what they expected. */}
            {activeFilterSummary && (
              <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-4 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                Answering for: {activeFilterSummary}
              </div>
            )}

            {/* §19 of the follow-up feature: what the assistant currently
                remembers from this conversation (lib/ai/conversation-context.ts),
                so a terse follow-up like "only Pune" doesn't feel like it
                works by magic — never internal implementation detail (no
                table/field names), just the same plain-language shape as the
                filter line above. */}
            {contextSummary && (
              <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-4 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                Remembering: {contextSummary}
              </div>
            )}

            <Composer
              value={input}
              onChange={setInput}
              onSubmit={submitComposer}
              onStop={stop}
              // Nothing to ground an answer in — see CUSTOM_DASHBOARD_MISSING_MESSAGE,
              // which the transcript is already showing. Disabled rather than
              // hidden so the panel still looks like itself.
              disabled={customDashboardMissing}
              // Either request in flight puts the composer in its stop state —
              // a 3-minute report generation with no way to cancel it would be
              // the worst version of this feature.
              busy={busy || actionBusy}
              placeholder={
                customDashboardMissing
                  ? "This dashboard's data isn't available in this browser"
                  : reportMode
                    ? `Describe the report you want from ${dashboardLabel}…`
                    : `Ask about ${dashboardLabel}…`
              }
              fullscreen={effectiveFullscreen}
              reportMode={reportMode}
              onToggleReportMode={() => setReportMode((v) => !v)}
              reportModeLabel={reportAction?.label ?? ""}
              reportModeSeconds={reportAction?.estimatedSeconds ?? 0}
              reportModeAvailable={reportAction !== null}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
