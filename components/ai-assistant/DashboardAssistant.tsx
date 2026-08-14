"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Sparkles, X } from "lucide-react";
import { dashboardKeyForPathname, dashboardMeta, type DashboardKey } from "@/lib/ai/dashboard-registry";
import { stashPendingPrompt, takePendingPrompt } from "@/lib/ai/assistant-handoff";
import { adoptConversationId, getOrCreateConversationId, resetConversationId } from "@/lib/ai/conversation-id";
import { stashTransferState, takeTransferState } from "@/lib/ai/assistant-transfer";
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

interface DashboardAssistantProps {
  /**
   * Renders as a full-page standalone view (app/assistant/page.tsx) instead
   * of the dashboard-embedded floating bubble+panel: no launcher bubble, no
   * drag position, no outside-click-to-close, and the panel fills the
   * viewport edge-to-edge rather than floating over dashboard content.
   */
  standalone?: boolean;
  /** Only consulted when `standalone` is true — the standalone page has no pathname to infer a dashboard from, so it's passed in explicitly instead (see app/assistant/page.tsx's `?dashboard=` search param). */
  standaloneDashboardKey?: DashboardKey | null;
}

/**
 * Floating chat scoped to exactly one of the dashboards in DASHBOARD_REGISTRY — whichever
 * the user is currently on. Unlike AiAssistant (the CSV-upload assistant),
 * this one needs no dataset upload: it's grounded server-side in that
 * dashboard's real, current aggregate data (see lib/ai/dashboard-context.ts).
 * A question that needs a different dashboard's data gets a redirect link,
 * never a guess — renders null outside the four dashboard routes.
 */
export function DashboardAssistant({ standalone = false, standaloneDashboardKey = null }: DashboardAssistantProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const dashboardKey = standalone ? standaloneDashboardKey : pathname ? dashboardKeyForPathname(pathname) : null;
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
  // A backdrop (click-to-minimize) only makes sense for the embedded
  // dashboard popover's OWN maximized view — mirrors the click-outside-closes
  // pattern FullscreenOverlay already uses for widget "expand to fullscreen"
  // dialogs elsewhere in this app. The standalone /assistant page has no
  // dashboard behind it to darken, and the small (non-fullscreen) popover
  // already closes via useOutsideClick instead of a backdrop.
  const showBackdrop = !standalone && fullscreen;
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
  // The ongoing conversation itself still travels across, just via
  // localStorage instead (see lib/ai/assistant-transfer.ts's module comment
  // for why noopener rules out sessionStorage for this specific handoff).
  const openInNewTab = useCallback(() => {
    if (!dashboardKey) return;
    stashTransferState({ dashboardKey, messages, conversationId, reportMode, input });
    window.open(`/assistant?dashboard=${dashboardKey}&transfer=true`, "_blank", "noopener,noreferrer");
  }, [dashboardKey, messages, conversationId, reportMode, input]);

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
    if (!dashboardKey) return;
    resettingRef.current = true;
    stop();
    setBusy(false);
    setConversationId(resetConversationId());
    setSuggestedFollowUps(null);
    setContextSummary(null);
    setReportMode(false);
    setMessages([{ role: "assistant", content: welcomeFor(dashboardKey), timestamp: Date.now() }]);
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
  }, [dashboardKey, stop]);

  // Reset the VISIBLE conversation when the user moves to a different
  // dashboard — an old exchange grounded in Payment Terms data would be
  // misleading once the assistant is answering for Tail Spend instead.
  // conversationId deliberately does NOT reset here (see its declaration
  // above) — cross-dashboard entity memory (§12) needs it to survive this.
  //
  // Also where a transferred conversation (openInNewTab's "Open in New Tab")
  // gets hydrated: this effect already runs once on mount (dashboardKey has
  // no "previous" value to compare against yet), which is exactly when a
  // freshly-opened standalone tab needs to pick up whatever the opener just
  // stashed. Checked here — inside the SAME effect that would otherwise reset
  // to the plain welcome message — rather than a separate effect, so there is
  // one obvious order of precedence instead of two effects racing to decide
  // `messages`/`input` on the same commit.
  useEffect(() => {
    if (!dashboardKey) return;
    const transfer = standalone ? takeTransferState(dashboardKey) : null;
    setMessages(transfer?.messages ?? [{ role: "assistant", content: welcomeFor(dashboardKey), timestamp: Date.now() }]);
    setSuggestedFollowUps(null);
    setContextSummary(null);
    setActionBusy(false);
    setUnread(false);
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    if (transfer) {
      setConversationId(transfer.conversationId);
      setReportMode(transfer.reportMode);
      setInput(transfer.input);
      return;
    }
    // Report mode deliberately SURVIVES navigation. Nothing turns it off except
    // the toggle itself and an explicit "Clear Chat" — see the note beside its
    // useState declaration.
    //
    // A redirect from another dashboard's assistant may have handed off the
    // question that got the user sent here — surface it in the input instead
    // of making them retype it, and open the panel so it's visible.
    const pending = takePendingPrompt();
    if (pending) {
      setInput(pending);
      setOpen(true);
    }
  }, [dashboardKey, standalone]);

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
          body: JSON.stringify({ dashboardKey, message, history, activeFilters: activeFilterSummary, conversationId }),
          signal: controller.signal,
        });
        const data: {
          reply?: string;
          redirect?: { key: DashboardKey; label: string; route: string } | null;
          options?: string[] | null;
          conversationId?: string;
          suggestedFollowUps?: string[] | null;
          contextSummary?: string | null;
          error?: string;
        } = await res.json().catch(() => ({}));
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
    [input, busy, dashboardKey, messages, activeFilterSummary, conversationId]
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
      if (!dashboardKey || actionBusy) return;

      // Held by reference so the response can find this exact entry again even
      // if chat messages land in the meantime — an index would go stale.
      const entry: ChatEntry = {
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        actionPlan: { status: "running", label: action.label, estimatedSeconds: action.estimatedSeconds },
      };
      const write = (actionPlan: ActionPlanState) =>
        setMessages((prev) => prev.map((m) => (m === entry ? { ...m, actionPlan } : m)));

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
        const res = await fetch("/api/assistant-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: action.id,
            dashboardKey,
            objective,
            activeFilters: activeFilterSummary,
            conversationId,
          }),
          signal: controller.signal,
        });
        const data: AssistantActionResponse = await res
          .json()
          .catch(() => ({ success: false, error: `Request failed (${res.status}).` }) as AssistantActionResponse);
        if (!res.ok || !data.success) {
          throw new Error(data.success ? `Request failed (${res.status}).` : data.error);
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
            prev
              // Remove the running card — no report is coming, and leaving a
              // spent progress card above the answer reads as a failure.
              .filter((m) => m !== entry)
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
    [dashboardKey, actionBusy, activeFilterSummary, conversationId, send]
  );

  // Which action Report mode runs. Registry-driven, so this component never
  // names a specific action; a dashboard with none simply hides the toggle.
  const reportAction = useMemo(
    () => (dashboardKey ? (assistantActionsFor(dashboardKey)[0] ?? null) : null),
    [dashboardKey]
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

  if (!dashboardKey) return null;
  if (isCapturing) return null;
  const meta = dashboardMeta(dashboardKey);
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
          // Always the same element in this position regardless of
          // showBackdrop/fullscreen — only its className/onClick vary. Making
          // the wrapper's own PRESENCE conditional on fullscreen would give
          // the motion.div a different parent shape between popover and
          // fullscreen, so React would unmount+remount it (replaying the exit
          // then enter animation, and losing the transcript's scroll
          // position) on every Maximize/Minimize click — exactly the glitch
          // this stable wrapper avoids.
          <div
            className={cn(
              "fixed inset-0 z-[60]",
              showBackdrop ? "bg-slate-950/60 backdrop-blur-sm" : "pointer-events-none"
            )}
            onClick={showBackdrop ? closePanel : undefined}
          >
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
              // The backdrop's own onClick (above) minimizes — this stops a
              // click anywhere inside the panel (transcript, header,
              // composer) from bubbling up and triggering that.
              onClick={(e) => e.stopPropagation()}
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
                // absolute, not fixed: the wrapper above is already a
                // fixed, exactly-viewport-sized (inset-0) positioning
                // context, so absolute positioning here resolves against the
                // viewport identically to `fixed` — while letting the
                // wrapper's own pointer-events toggle apply.
                "pointer-events-auto absolute flex flex-col overflow-hidden bg-white dark:bg-slate-900",
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
                dashboardLabel={meta.label}
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
                      dashboardLabel={meta.label}
                      welcomeText={messages[0]?.content ?? welcomeFor(dashboardKey)}
                      onSelect={(text) => void send(text)}
                      disabled={busy}
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
                // Either request in flight puts the composer in its stop state —
                // a 3-minute report generation with no way to cancel it would be
                // the worst version of this feature.
                busy={busy || actionBusy}
                placeholder={
                  reportMode
                    ? `Describe the report you want from ${meta.label}…`
                    : `Ask about ${meta.label}…`
                }
                fullscreen={effectiveFullscreen}
                reportMode={reportMode}
                onToggleReportMode={() => setReportMode((v) => !v)}
                reportModeLabel={reportAction?.label ?? ""}
                reportModeSeconds={reportAction?.estimatedSeconds ?? 0}
                reportModeAvailable={reportAction !== null}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
