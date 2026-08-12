"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Bot, Check, Copy, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatEntry } from "./DashboardAssistant";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { RedirectCard } from "./RedirectCard";
import { SuggestionChips, type Suggestion } from "./SuggestionChips";
import { ActionPlanCard } from "./ActionPlanCard";
import { AssistantActions } from "./AssistantActions";
import type { AssistantActionDefinition } from "@/lib/ai/actions/assistant-actions";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";

interface MessageBubbleProps {
  message: ChatEntry;
  fullscreen: boolean;
  busy: boolean;
  onOptionSelect: (option: string) => void;
  onRedirect: (redirect: NonNullable<ChatEntry["redirect"]>) => void;
  /** Canned follow-up prompts shown under the last assistant answer — only passed for that one message. */
  followUps?: Suggestion[];
  dashboardKey: DashboardKey;
  /** Passed only for the one message the action row belongs under — undefined everywhere else, which is what hides the row. */
  onRunAction?: (action: AssistantActionDefinition) => void;
  /** True while a report is already generating — the row stays visible but inert. */
  actionBusy?: boolean;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Renders one turn of the conversation. User turns stay a simple right-aligned
 * bubble; assistant turns become a labeled "response card" — same content
 * (AssistantMarkdown, redirect, options) as before, just with a clearer
 * visual identity so replies read as structured analytics answers rather
 * than generic chat blobs.
 */
export function MessageBubble({
  message,
  fullscreen,
  busy,
  onOptionSelect,
  onRedirect,
  followUps,
  dashboardKey,
  onRunAction,
  actionBusy,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  // A report card carries no prose of its own, so the copy affordance and the
  // markdown body below both have nothing to act on.
  const isActionCard = Boolean(message.actionPlan);
  const [copied, setCopied] = useState(false);

  const copyReply = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(message.content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard permission denied or unavailable — silently no-op rather
        // than surfacing an error for a purely convenience affordance.
      });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
            : message.isError
              ? "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300"
              : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
        )}
        aria-hidden="true"
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : message.isError ? <AlertCircle className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </span>

      <div className={cn("flex min-w-0 flex-col gap-1", fullscreen ? "max-w-[80%]" : "max-w-[92%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "group relative w-full rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            isUser
              ? "whitespace-pre-wrap bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : message.isError
                ? "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
                : "border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
          )}
        >
          {!isUser && !message.isError && !isActionCard && (
            <button
              type="button"
              onClick={copyReply}
              aria-label={copied ? "Copied" : "Copy response"}
              title={copied ? "Copied" : "Copy response"}
              className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-md text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}

          {isUser ? (
            message.content
          ) : isActionCard ? null : (
            <AssistantMarkdown text={message.content} className="pr-5" />
          )}

          {message.actionPlan && <ActionPlanCard state={message.actionPlan} />}

          {message.redirect && <RedirectCard redirect={message.redirect} onNavigate={() => onRedirect(message.redirect!)} />}

          {message.options && message.options.length > 0 && (
            <SuggestionChips
              items={message.options.map((option) => ({ label: option }))}
              onSelect={onOptionSelect}
              disabled={busy}
              variant="pill"
              className="mt-3"
            />
          )}

          {!message.redirect && followUps && followUps.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700/60">
              <p className="mb-1.5 text-[0.7rem] font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">
                Follow up
              </p>
              <SuggestionChips items={followUps} onSelect={onOptionSelect} disabled={busy} variant="pill" />
            </div>
          )}

          {/* Present only on the one message DashboardAssistant chose (§15) —
              nothing here can start an action on its own; it renders a button. */}
          {onRunAction && (
            <AssistantActions dashboardKey={dashboardKey} onRun={onRunAction} disabled={busy || Boolean(actionBusy)} />
          )}
        </div>
        {message.timestamp && (
          <time dateTime={new Date(message.timestamp).toISOString()} className="px-1 text-[0.65rem] text-slate-400 dark:text-slate-500">
            {formatTime(message.timestamp)}
          </time>
        )}
      </div>
    </motion.div>
  );
}
