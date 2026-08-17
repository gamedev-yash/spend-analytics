"use client";

import type { ChatEntry } from "@/components/ai-assistant/DashboardAssistant";
import type { DashboardContextId } from "@/lib/ai/dashboard-context";

// localStorage-backed persistence for the dashboard assistant's visible
// transcript — chat persistence feature. Same module-singleton-over-
// localStorage shape as lib/generated-dashboard/store.ts (quota-safe
// persist() that drops the oldest entry on QuotaExceededError), but read
// through a plain getter rather than a useSyncExternalStore hook:
// DashboardAssistant only ever needs the CURRENT value once, imperatively,
// inside the same navigation effect that decides whether to restore it —
// never as a value a render subscribes to. A reactive hook here would
// re-fire that effect every time this module's own saveConversation() below
// writes a new value, which is exactly the every-answer/every-suggestion-
// click case — a feedback loop, not a feature.
//
// Keyed by DashboardContextId ("builtin:tail-spend" / "custom:abc123"),
// exactly like every other dashboard-scoped store in this app (conversation
// memory, report cache, custom-dashboard registry) — one persisted
// conversation per dashboard, matching the product's existing
// one-conversation-per-dashboard model (no history browser/multi-conversation
// UI is introduced here).
//
// Chosen over a server-side store because this app has no auth/session layer
// and no chat DB (see lib/ai/conversation-context.ts's module comment), while
// generated dashboards themselves already live entirely in localStorage —
// this is the established place "durable enough to survive a refresh" data
// goes.
//
// Deliberately NOT persisted here: `conversationId` (stays exactly as it
// works today — one id per browser TAB in sessionStorage, shared across
// dashboard navigation for cross-dashboard entity-memory continuity; see
// lib/ai/conversation-id.ts) and every transient UI flag (busy, open,
// unread, scroll position) — none of those belong in a durable record.

export interface PersistedConversation {
  contextId: DashboardContextId;
  updatedAt: number;
  messages: ChatEntry[];
  reportMode: boolean;
  suggestedFollowUps: string[] | null;
  /** Normalized (question-normalize.ts) text of every follow-up suggestion ever clicked in this conversation — so a used one never resurfaces after a refresh. */
  usedSuggestions: string[];
  contextSummary: string | null;
}

const STORAGE_KEY = "vedata_assistant_conversations";

// Bounds how many dashboards' conversations this app will remember at once —
// a demo user opening dozens of generated dashboards shouldn't grow this
// without limit. LRU by updatedAt, same eviction shape persist() below uses
// for a quota error.
const MAX_CONVERSATIONS = 30;

type ConversationMap = Partial<Record<DashboardContextId, PersistedConversation>>;

const EMPTY: ConversationMap = {};

let storeState: ConversationMap | null = null;

function isPersistedConversation(value: unknown): value is PersistedConversation {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<PersistedConversation>;
  return typeof c.contextId === "string" && typeof c.updatedAt === "number" && Array.isArray(c.messages);
}

function loadPersisted(): ConversationMap {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY;
    const result: ConversationMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isPersistedConversation(value)) result[key as DashboardContextId] = value;
    }
    return result;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): ConversationMap {
  if (storeState === null) storeState = loadPersisted();
  return storeState;
}

/** Oldest-first by updatedAt — used to decide what to drop on overflow/quota. */
function oldestContextId(map: ConversationMap): DashboardContextId | null {
  let oldestId: DashboardContextId | null = null;
  let oldestAt = Infinity;
  for (const [id, record] of Object.entries(map) as [DashboardContextId, PersistedConversation][]) {
    if (record.updatedAt < oldestAt) {
      oldestAt = record.updatedAt;
      oldestId = id;
    }
  }
  return oldestId;
}

function withoutContext(map: ConversationMap, contextId: DashboardContextId): ConversationMap {
  const rest = { ...map };
  delete rest[contextId];
  return rest;
}

/** Persist, dropping the oldest conversation and retrying on quota errors — mirrors generated-dashboard/store.ts's persist(). */
function persist(map: ConversationMap): void {
  let toPersist = map;
  for (;;) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
      storeState = toPersist;
      return;
    } catch (err) {
      const oldest = oldestContextId(toPersist);
      if (!oldest) {
        console.warn("conversation-store: unable to persist even an empty map", err);
        storeState = toPersist;
        return;
      }
      console.warn("conversation-store: localStorage quota exceeded, dropping oldest conversation", err);
      toPersist = withoutContext(toPersist, oldest);
    }
  }
}

function updateStore(update: (prev: ConversationMap) => ConversationMap): void {
  const next = update(getSnapshot());
  persist(next);
}

/** Upserts the conversation for this dashboard context, evicting the oldest entry first if that would exceed MAX_CONVERSATIONS. */
export function saveConversation(record: Omit<PersistedConversation, "updatedAt">): void {
  if (typeof window === "undefined") return;
  updateStore((prev) => {
    const next: ConversationMap = { ...prev, [record.contextId]: { ...record, updatedAt: Date.now() } };
    if (Object.keys(next).length <= MAX_CONVERSATIONS) return next;
    const oldest = oldestContextId(next);
    if (!oldest || oldest === record.contextId) return next;
    return withoutContext(next, oldest);
  });
}

/** "New chat" — drops the persisted record entirely so the next visit starts fresh instead of resurrecting the cleared conversation. */
export function clearConversation(contextId: DashboardContextId): void {
  if (typeof window === "undefined") return;
  updateStore((prev) => (contextId in prev ? withoutContext(prev, contextId) : prev));
}

/**
 * One dashboard's persisted conversation, or null if none is stored yet.
 * Plain synchronous read (localStorage access is synchronous) — call this
 * imperatively from an effect, not during render; see the module comment on
 * why this isn't a React hook.
 */
export function getPersistedConversation(contextId: DashboardContextId | null): PersistedConversation | null {
  if (!contextId) return null;
  return getSnapshot()[contextId] ?? null;
}
